"""Notifications: which warnings a save causes. The rules match frontend/src/lib/budget.ts, so email and screen agree."""

import html
import logging
import math
import os
import smtplib
import ssl
from datetime import date
from email.message import EmailMessage

from anomalies import month_unusual
from auth import AuthUser
from db import connect
from months import days_in, month_range, today

log = logging.getLogger("notify")

ALL_ON = {"email_enabled": True, "near_limit": True, "over_limit": True, "run_out": True, "unusual": True, "new_month": True}


def peso(n: float) -> str:
    return f"₱{n:,.0f}"


def short_date(iso: str) -> str:
    """Nov 14, as the budget cards write it."""
    return f"{date.fromisoformat(iso):%b} {int(iso[8:])}"


def budget_state(spent: float, limit: float, warn_at: int) -> str:
    """ok, near, used or over: budgetState in budget.ts."""
    if spent > limit:
        return "over"
    if limit - spent < 0.005:  # to the centavo: sums of pesos can land a hair under the limit
        return "used"
    return "near" if spent >= limit * warn_at / 100 else "ok"


def runs_out(spent: float, limit: float, month: str, today_iso: str) -> str | None:
    """The day this pace runs out, when that's before month-end: pace in budget.ts. None: a past month, before day 5
    (too few days to go on), already over, or it lasts."""
    day = int(today_iso[8:])
    if month != today_iso[:7] or day < 5 or spent > limit or spent <= 0:
        return None
    out = day + (limit - spent) / (spent / day)
    return None if out >= days_in(month) else f"{month}-{math.ceil(out):02d}"


def end_line(limit: float, spent: float) -> str:
    """How a finished month ended against its monthly budget: endLine in budget.ts."""
    left = math.floor(limit - spent + 0.5)
    if left > 0:
        return f"You stayed {peso(left)} under your {peso(limit)} monthly budget."
    if left < 0:
        return f"You went {peso(-left)} over your {peso(limit)} monthly budget."
    return f"You used your whole {peso(limit)} monthly budget."


def get_settings(conn, user_id) -> dict:
    """The user's switches. A missing row means everything is on."""
    row = conn.execute(
        "select email_enabled, near_limit, over_limit, run_out, unusual, new_month from notification_settings where user_id = %s",
        (user_id,),
    ).fetchone()
    return row or dict(ALL_ON)


def add_row(conn, user_id, key, kind, title, body, link, email_enabled) -> bool:
    """Store a notification once per key, ever. True when it's new. With email off it's marked as handled, so turning
    email on later doesn't send old warnings.

    Users can only mark notifications read (the notifications_server_only migration), or they could write rows through
    Supabase's REST API that get emailed. So the insert runs as the connection's own role, as restore does, and switches
    back after. A failed insert needs no switch back: the savepoint or transaction it fails in undoes the role too."""
    role = conn.execute("select current_setting('role') as r").fetchone()["r"]
    conn.execute("select set_config('role', 'none', true)")
    new = conn.execute(
        """
        insert into notifications (user_id, key, kind, title, body, link, emailed_at)
        values (%s, %s, %s, %s, %s, %s, case when %s then null else now() end)
        on conflict (user_id, key) do nothing returning id
        """,
        (user_id, key, kind, title, body, link, email_enabled),
    ).fetchone() is not None
    conn.execute("select set_config('role', %s, true)", (role,))
    return new


def _state_copy(state: str, name: str, spent: float, limit: float) -> tuple[str, str]:
    if state == "near":
        return f"{name} is at {round(spent / limit * 100)}%", f"You've used {peso(spent)} of {peso(limit)}."
    if state == "used":
        return f"{name} is used up", "Anything more this month goes over."
    return f"{name} is {peso(spent - limit)} over", f"You've spent {peso(spent)} of {peso(limit)}."


def check_budgets(conn, user_id, settings) -> None:
    """Store what this month's budgets call for. Same rules as the Budgets page: a once-a-month category only warns when
    over and has no pace, and the pace leaves out once-a-month categories and unusual purchases."""
    now = today()
    month = now.strftime("%Y-%m")
    start, end = month_range(month)
    budgets = conn.execute(
        """
        select b.category_id, b.limit_amount::float as limit, b.warn_at, c.name, coalesce(c.once_a_month, false) as once_a_month,
          coalesce((select sum(t.amount) from transactions t
                    where t.user_id = b.user_id and t.kind = 'expense' and t.date >= %(start)s and t.date < %(end)s
                      and (b.category_id is null or t.category_id = b.category_id)), 0)::float as spent
        from budgets b left join categories c on c.id = b.category_id
        where b.user_id = %(uid)s
        order by b.category_id nulls first
        """,
        {"uid": user_id, "start": start, "end": end},
    ).fetchall()
    if not budgets:
        return
    fixed = conn.execute(
        """
        select c.id, coalesce(sum(t.amount), 0)::float as total from categories c
        left join transactions t on t.category_id = c.id and t.kind = 'expense' and t.date >= %(start)s and t.date < %(end)s
        where c.user_id = %(uid)s and c.once_a_month
        group by c.id
        """,
        {"uid": user_id, "start": start, "end": end},
    ).fetchall()
    unusual: dict = {}
    for u in month_unusual(conn, user_id, start, end):
        unusual[u["category_id"]] = unusual.get(u["category_id"], 0) + float(u["amount"])
    limits = {b["category_id"]: b["limit"] for b in budgets}
    fixed_spent = sum(f["total"] for f in fixed)
    reserved = sum(max(f["total"], limits.get(f["id"], 0)) for f in fixed)

    for b in budgets:
        monthly = b["category_id"] is None
        label = "monthly" if monthly else str(b["category_id"])
        name = "Your monthly budget" if monthly else f"{b['name']} budget"
        state = budget_state(b["spent"], b["limit"], b["warn_at"])
        wanted = state == "over" if b["once_a_month"] else state != "ok"
        switch = "near_limit" if state == "near" else "over_limit"
        if wanted and settings[switch]:
            title, body = _state_copy(state, name, b["spent"], b["limit"])
            add_row(conn, user_id, f"{state}:{label}:{month}", state, title, body, "/budgets", settings["email_enabled"])

        if b["once_a_month"] or not settings["run_out"]:
            continue
        out = sum(unusual.values()) if monthly else unusual.get(b["category_id"], 0)
        spent = b["spent"] - out - (fixed_spent if monthly else 0)
        limit = b["limit"] - out - (reserved if monthly else 0)
        runs = runs_out(spent, limit, month, now.isoformat())
        if runs:
            per_day = (limit - spent) / (days_in(month) - now.day + 1)
            add_row(
                conn, user_id, f"runout:{label}:{month}", "run_out",
                f"Spending fast: {'your monthly budget' if monthly else name} runs out {short_date(runs)}",
                f"Keep to {peso(per_day)} a day to last the month.", "/budgets", settings["email_enabled"],
            )


def check_unusual(conn, user_id, txn_id, settings) -> None:
    """A purchase just judged unusual that nobody has decided on yet."""
    if not settings["unusual"]:
        return
    row = conn.execute(
        """
        select t.amount::float as amount, t.date, c.name, a.usual_low::float as usual_low, a.usual_high::float as usual_high
        from anomaly_checks a
        join transactions t on t.id = a.transaction_id
        join categories c on c.id = t.category_id
        where a.transaction_id = %s and t.user_id = %s and a.unusual and a.decision is null
        """,
        (txn_id, user_id),
    ).fetchone()
    if not row:
        return
    usual = f"You usually spend {peso(row['usual_low'])} to {peso(row['usual_high'])} there." if row["usual_low"] is not None and row["usual_high"] is not None else ""
    add_row(
        conn, user_id, f"unusual:{txn_id}", "unusual", f"Unusual purchase: {peso(row['amount'])} on {row['name']}",
        usual, f"/activity?month={row['date']:%Y-%m}", settings["email_enabled"],
    )


def after_save(conn, user_id, txn_id=None) -> None:
    """Store what a save calls for, inside its transaction. A bug here must not cost anyone their save, so it runs in a
    savepoint and only logs."""
    try:
        with conn.transaction():
            settings = get_settings(conn, user_id)
            check_budgets(conn, user_id, settings)
            if txn_id:
                check_unusual(conn, user_id, txn_id, settings)
    except Exception:
        log.exception("notification checks failed")


# ---------------------------------------------------------------------------------------------- email

def email_ready() -> bool:
    return bool(os.environ.get("SMTP_USER") and os.environ.get("SMTP_APP_PASSWORD"))


def open_smtp() -> smtplib.SMTP:
    smtp = smtplib.SMTP("smtp.gmail.com", 587, timeout=5)
    smtp.starttls(context=ssl.create_default_context())
    smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_APP_PASSWORD"])
    return smtp


def send_email(to: str, subject: str, text: str, html_body: str) -> None:
    """Send one email, as plain text and HTML. Raises on failure."""
    message = EmailMessage()
    message["Subject"], message["From"], message["To"] = subject, f"AntTipid <{os.environ['SMTP_USER']}>", to
    message.set_content(text)
    message.add_alternative(html_body, subtype="html")
    with open_smtp() as smtp:
        smtp.send_message(message)


def letter(heading: str, paragraphs: list[list[tuple[str, bool]]], links: list[tuple[str, str]]) -> tuple[str, str]:
    """The email's text and HTML, as a short letter so it never reads like a bill. A paragraph is (words, bold) runs; a
    link is (label, app path). Everything passed in is escaped here."""
    app = os.environ.get("APP_URL", "").rstrip("/")
    settings = f"{app}/settings?tab=notifications"
    why = "You received this email because notifications are on for this address on AntTipid."
    copyright_line = f"© {today().year} AntTipid"
    text = "\n\n".join([
        heading,
        *("".join(words for words, _ in runs) for runs in paragraphs),
        *(f"{label}: {app}{path}" for label, path in links),
        "Thank you,\nAntTipid\nYour expense and budget tracker",
        f"{why}\n\nManage notifications: {settings}\n\n{copyright_line}",
    ])

    esc = lambda words: html.escape(words, quote=False)  # noqa: E731
    run = lambda words, bold: f"<strong>{esc(words)}</strong>" if bold else esc(words)  # noqa: E731
    p = "margin:0 0 16px"
    link = "color:#1155cc;font-weight:bold;text-decoration:underline"
    small = "margin:0 0 10px;font-size:12px;line-height:1.5;color:#5f6368"
    body = "".join(f'<p style="{p}">{"".join(run(w, b) for w, b in runs)}</p>' for runs in paragraphs)
    buttons = "".join(f'<p style="margin:0 0 8px"><a href="{html.escape(app + path)}" style="{link}">{esc(label)}</a></p>' for label, path in links)
    page = (
        '<div style="max-width:600px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">'
        f'<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">{esc(heading)}</h1>{body}{buttons}'
        '<p style="margin:20px 0 16px">Thank you,</p>'
        '<p style="margin:0"><strong>AntTipid</strong></p><p style="margin:0 0 20px">Your expense and budget tracker</p>'
        '<div style="border-top:1px solid #dadce0;padding-top:16px">'
        f'<p style="{small}">{why}</p>'
        f'<p style="{small}">Manage notifications<br><a href="{html.escape(settings)}" style="color:#1155cc">{esc(settings)}</a></p>'
        f'<p style="{small}">{copyright_line}</p></div></div>'
    )
    return text, page


def email_text(rows: list[dict]) -> tuple[str, str, str]:
    """Subject, text and HTML for one save's new notifications. No user-typed text goes in the subject."""
    count = len(rows)
    subject = f"AntTipid: {count} new notification{'' if count == 1 else 's'}"
    if all(r["kind"] != "unusual" for r in rows):
        heading = "Your budget needs a look" if count == 1 else "Your budgets need a look"
    else:
        heading = "Unusual purchase" if count == 1 else "A few things need a look"
    link = ("See your budgets", "/budgets") if all(r["link"] == "/budgets" for r in rows) else ("Open AntTipid", "/")
    paragraphs = [[(f"{r['title']}.", True), *([(f" {r['body']}", False)] if r["body"] else [])] for r in rows]
    return (subject, *letter(heading, paragraphs, [link]))


def send_pending(user: AuthUser) -> None:
    """Email this user's new notifications, after the save's transaction has committed. Never raises: the save already
    worked. Rows are claimed first so two saves can't send the same one, and given back if sending fails, for the next
    save to retry. Rows over a day old aren't sent, so email set up later doesn't deliver old warnings."""
    to = user.claims.get("email")
    if not to or not email_ready():
        return
    try:
        # The server's own connection: users can't write emailed_at. Every statement names user_id itself.
        with connect() as conn:
            rows = conn.execute(
                """
                update notifications set emailed_at = now()
                where user_id = %s and emailed_at is null and created_at > now() - interval '1 day'
                returning id, kind, title, body, link
                """,
                (user.id,),
            ).fetchall()
        if not rows:
            return
        rows.sort(key=lambda r: r["id"])
        try:
            send_email(to, *email_text(rows))
        except Exception:
            log.exception("notification email failed")
            with connect() as conn:
                conn.execute("update notifications set emailed_at = null where id = any(%s) and user_id = %s", ([r["id"] for r in rows], user.id))
    except Exception:
        log.exception("couldn't work out which notifications to email")
