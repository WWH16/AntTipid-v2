"""Notification routes. Separate from notify.py because ledger.py and reports.py import notify, and the recap here
imports from reports.py."""

import logging

from fastapi import APIRouter, HTTPException

import notify
from auth import User
from db import user_tx
from models import NotificationList, NotificationSettings

router = APIRouter()
log = logging.getLogger("notify")


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
