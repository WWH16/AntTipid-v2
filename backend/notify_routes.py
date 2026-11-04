"""Notification routes. Separate from notify.py because ledger.py and reports.py import notify, and the recap here
imports from reports.py."""

from fastapi import APIRouter

import notify
from auth import User
from db import user_tx
from models import NotificationList, NotificationSettings

router = APIRouter()


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
