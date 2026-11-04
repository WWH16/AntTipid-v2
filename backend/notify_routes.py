"""Notification routes. Separate from notify.py because ledger.py and reports.py import notify, and the recap here
imports from reports.py."""

import hmac
import logging
import os
from datetime import date

from fastapi import APIRouter, Header, HTTPException

import notify
from auth import AuthUser, User
from db import connect, user_tx
from models import NotificationList, NotificationSettings
from months import current_month, month_range, shift_month
from reports import TOTALS, _budgets_in

router = APIRouter()
log = logging.getLogger("notify")

MAX_RECAP_EMAILS = 400  # ponytail: Gmail allows about 500 emails a day. Move to a mail service if users outgrow that.


@router.get("/notifications", response_model=NotificationList)
def list_notifications(user: User):
    with user_tx(user) as conn:
        items = conn.execute(
            "select id, kind, title, body, link, created_at, read_at from notifications where user_id = %s order by id desc limit 50",
            (user.id,),
        ).fetchall()
        unread = conn.execute("select count(*) as n from notifications where user_id = %s and read_at is null", (user.id,)).fetchone()
    return {"items": items, "unread": unread["n"]}


@router.post("/notifications/read", status_code=204)
def mark_read(user: User):
    with user_tx(user) as conn:
        conn.execute("update notifications set read_at = now() where user_id = %s and read_at is null", (user.id,))


@router.get("/notifications/settings", response_model=NotificationSettings)
def read_settings(user: User):
    with user_tx(user) as conn:
        return notify.get_settings(conn, user.id)


@router.put("/notifications/settings", response_model=NotificationSettings)
def save_settings(body: NotificationSettings, user: User):
    with user_tx(user) as conn:
        conn.execute(
            """
            insert into notification_settings (user_id, email_enabled, near_limit, over_limit, run_out, unusual, new_month)
            values (%s, %s, %s, %s, %s, %s, %s)
            on conflict (user_id) do update set email_enabled = excluded.email_enabled, near_limit = excluded.near_limit,
              over_limit = excluded.over_limit, run_out = excluded.run_out, unusual = excluded.unusual, new_month = excluded.new_month
            """,
            (user.id, body.email_enabled, body.near_limit, body.over_limit, body.run_out, body.unusual, body.new_month),
        )
    return body


@router.post("/notifications/test", status_code=204)
def send_test_email(user: User):
    """Sends only to the signed-in user's own address. One a minute, so it can't eat the daily Gmail allowance."""
    to = user.claims.get("email")
    if not to or not notify.email_ready():
        raise HTTPException(503, "Email isn't set up on this server yet.")
    with user_tx(user) as conn:
        allowed = conn.execute(
            """
            insert into notification_settings (user_id, test_email_at) values (%s, now())
            on conflict (user_id) do update set test_email_at = now()
            where notification_settings.test_email_at is null or notification_settings.test_email_at < now() - interval '60 seconds'
            returning user_id
            """,
            (user.id,),
        ).fetchone()
    if not allowed:
        raise HTTPException(429, "Wait a minute before sending another test email.")
    text, page = notify.letter(
        "Your test email",
        [[("Notification email is working.", True), (" AntTipid will write to you here when a budget or a purchase needs a look.", False)]],
        [("Open AntTipid", "/")],
    )
    try:
        notify.send_email(to, "AntTipid: test email", text, page)
    except Exception:
        log.exception("test email failed")
        raise HTTPException(502, "Couldn't send the email. Try again in a minute.")


# ---------------------------------------------------------------------------------------------- new-month recap


def _month_name(month: str) -> str:
    return f"{date.fromisoformat(f'{month}-01'):%B}"


def recap_runs(month: str, income: float, spent: float, monthly_limit: float | None, top_name: str | None, top_total: float) -> list:
    """Last month's recap and a little reminder, in sentences so it doesn't read like a bill. Paragraphs of (words, bold)
    runs, as notify.letter takes them."""
    saved = income - spent
    result = [("saved ", False), (notify.peso(saved), True), (".", False)] if saved >= 0 else [("spent ", False), (f"{notify.peso(-saved)} more than you earned", True), (".", False)]
    first = [(f"In {_month_name(month)}, you earned {notify.peso(income)} and spent {notify.peso(spent)}, so you ", False), *result]
    if top_name:
        first += [(" Your biggest category was ", False), (top_name, True), (f", at {notify.peso(top_total)}.", False)]
    return [
        first,
        *([[(notify.end_line(monthly_limit, spent), False)]] if monthly_limit else []),
        [("A new month has started, so it's a good time to ", False), ("check your budgets", True), (f" for {_month_name(shift_month(month, 1))}.", False)],
    ]


def recap_body(runs: list) -> str:
    """The recap as the bell shows it."""
    return " ".join("".join(words for words, _ in paragraph) for paragraph in runs)


def recap_email(month: str, runs: list) -> tuple[str, str, str]:
    name = _month_name(month)
    links = [(f"See your {name} report", f"/reports?month={month}"), ("Check your budgets", "/budgets")]
    return (f"AntTipid: your {name} recap", *notify.letter(f"Your {name} recap", runs, links))


def _recap_for(conn, user_id, month: str) -> list:
    start, end = month_range(month)
    totals = conn.execute(TOTALS, {"uid": user_id, "start": start, "end": end}).fetchone()
    budgets = _budgets_in(conn, AuthUser(id=user_id, token="", claims={}), start)
    monthly = next((float(b["limit_amount"]) for b in budgets if b["category_id"] is None), None)
    top = conn.execute(
        """
        select c.name, sum(t.amount)::float as total from transactions t join categories c on c.id = t.category_id
        where t.user_id = %s and t.kind = 'expense' and t.date >= %s and t.date < %s
        group by c.name order by total desc limit 1
        """,
        (user_id, start, end),
    ).fetchone()
    return recap_runs(month, float(totals["income"]), float(totals["spent"]), monthly, top and top["name"], top["total"] if top else 0)


def run_new_month(month: str, only_users: list[str] | None = None) -> dict:
    """Store and email the recap of `month`, the month just ended. Safe to run again: each user gets one row, and only
    rows not emailed yet are sent. Tests must pass only_users: without it this covers every user in the project."""
    start, end = month_range(month)
    key = f"new_month:{shift_month(month, 1)}"
    created, recaps = 0, {}
    with connect() as conn:
        users = conn.execute(
            """
            select u.id, u.email, coalesce(s.email_enabled, true) as email_enabled
            from auth.users u left join notification_settings s on s.user_id = u.id
            where coalesce(s.new_month, true)
              and exists (select 1 from transactions t where t.user_id = u.id and t.date >= %(start)s and t.date < %(end)s)
              and (%(only)s::uuid[] is null or u.id = any(%(only)s::uuid[]))
            """,
            {"start": start, "end": end, "only": only_users},
        ).fetchall()
        for u in users:
            runs = _recap_for(conn, u["id"], month)
            recaps[u["id"]] = (u["email"], runs)
            created += notify.add_row(
                conn, u["id"], key, "new_month", f"Your {_month_name(month)} recap", recap_body(runs), f"/reports?month={month}", u["email_enabled"],
            )
        waiting = conn.execute(
            """
            select user_id from notifications
            where key = %s and emailed_at is null and created_at > now() - interval '1 day' and user_id = any(%s::uuid[])
            limit %s
            """,
            (key, list(recaps), MAX_RECAP_EMAILS),
        ).fetchall()

    sent = []
    if waiting and notify.email_ready():  # no database connection is held while sending
        try:
            with notify.open_smtp() as smtp:
                for row in waiting:
                    email, runs = recaps[row["user_id"]]
                    try:
                        notify.send_email(email, *recap_email(month, runs), smtp=smtp)
                        sent.append(row["user_id"])
                    except Exception:
                        log.exception("recap email failed")
        except Exception:
            log.exception("couldn't open the mail connection")
    if sent:
        with connect() as conn:
            conn.execute("update notifications set emailed_at = now() where key = %s and user_id = any(%s::uuid[])", (key, sent))
    return {"created": created, "sent": len(sent)}


@router.get("/cron/new-month")
def new_month_job(authorization: str | None = Header(default=None)):
    """Called by Vercel Cron on the 1st, with CRON_SECRET as a Bearer token."""
    secret = os.environ.get("CRON_SECRET")
    if not secret or not hmac.compare_digest((authorization or "").encode(), f"Bearer {secret}".encode()):
        raise HTTPException(401, "Not allowed.")
    return run_new_month(shift_month(current_month(), -1))
