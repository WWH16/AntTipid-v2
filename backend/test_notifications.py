"""Notification checks: the rules, what gets stored, what gets emailed. Never sends real email.

Run with: .venv/Scripts/python test_notifications.py
"""

import os
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from psycopg import errors

from db import connect, user_tx
from main import app
from months import current_month, shift_month, today
from notify import budget_state, email_ready, email_text, end_line, runs_out, send_pending, short_date
from notify_routes import recap_body, recap_email, recap_runs, run_new_month
from test_audit_backup import direct, food_id, needs_db, users, wallet

ALL_ON = {"emailEnabled": True, "nearLimit": True, "overLimit": True, "runOut": True, "unusual": True, "newMonth": True}

RUN_OUT = [  # spent, limit, month, today, expected. The same table is in frontend/src/lib/budget.test.ts.
    (6000, 10000, "2026-11", "2026-11-10", "2026-11-17"),
    (1000, 10000, "2026-11", "2026-11-10", None),
    (6000, 10000, "2026-11", "2026-11-04", None),
    (11000, 10000, "2026-11", "2026-11-10", None),
    (0, 10000, "2026-11", "2026-11-10", None),
    (6000, 10000, "2026-10", "2026-11-10", None),
    (3000, 9000, "2026-11", "2026-11-10", None),
    (7000, 10000, "2026-02", "2026-02-14", "2026-02-20"),
]


def test_runs_out_matches_the_screen():
    for spent, limit, month, today_iso, want in RUN_OUT:
        assert runs_out(spent, limit, month, today_iso) == want, (spent, limit, month, today_iso)


def test_budget_state():
    for spent, want in ((799.99, "ok"), (800, "near"), (999.996, "used"), (1000, "used"), (1000.01, "over")):
        assert budget_state(spent, 1000, 80) == want, spent


def test_end_line():
    assert end_line(1000, 800) == "You stayed ₱200 under your ₱1,000 monthly budget."
    assert end_line(1000, 1200) == "You went ₱200 over your ₱1,000 monthly budget."
    assert end_line(1000, 1000) == "You used your whole ₱1,000 monthly budget."


def at_day(n):
    """Run-out follows the calendar, so tests pick the day. Before day 5 it's off."""
    return patch("notify.today", return_value=today().replace(day=n))


def expense_body(wallet_id, category_id, amount, day=1, **extra):
    return {"kind": "expense", "amount": amount, "title": "Lunch", "date": today().replace(day=day).isoformat(),
            "walletId": wallet_id, "categoryId": category_id, "note": "", "source": "manual", **extra}


def spend(client, h, wallet_id, category_id, amount, day=1, **extra):
    res = client.post("/api/transactions", headers=h, json=expense_body(wallet_id, category_id, amount, day, **extra))
    assert res.status_code == 201, res.text
    return res.json()["id"]


def budget(client, h, category_id, limit, warn_at=80):
    res = client.post("/api/budgets", json={"categoryId": category_id, "limit": limit, "warnAt": warn_at}, headers=h)
    assert res.status_code == 204, res.text


def category(client, h, name, **extra):
    res = client.post("/api/categories", json={"name": name, "kind": "expense", "icon": "other", **extra}, headers=h)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def db_keys(uid):
    with connect() as conn:
        return {r["key"] for r in conn.execute("select key from notifications where user_id = %s", (uid,))}


@needs_db
def test_budget_states_fire_once_each():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        month = current_month()
        budget(client, h, None, 1000)
        spend(client, h, w, food, 850)
        assert db_keys(uid) == {f"near:monthly:{month}"}
        spend(client, h, w, food, 10)  # still near
        assert db_keys(uid) == {f"near:monthly:{month}"}
        spend(client, h, w, food, 200)  # over skips used
        assert db_keys(uid) == {f"near:monthly:{month}", f"over:monthly:{month}"}


@needs_db
def test_used_up_has_its_own_key():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        budget(client, h, food, 1000)
        spend(client, h, w, food, 1000)
        assert db_keys(uid) == {f"used:{food}:{current_month()}"}


@needs_db
def test_going_over_twice_in_a_month_fires_once():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        budget(client, h, None, 1000)
        first = spend(client, h, w, food, 1100)
        assert client.delete(f"/api/transactions/{first}", headers=h).status_code == 204
        spend(client, h, w, food, 1100)
        assert db_keys(uid) == {f"over:monthly:{current_month()}"}


@needs_db
def test_budget_save_can_fire():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        spend(client, h, w, food, 500)
        assert db_keys(uid) == set()
        budget(client, h, None, 550)
        assert db_keys(uid) == {f"near:monthly:{current_month()}"}


@needs_db
def test_once_a_month_category_fires_only_when_over():
    with users() as (client, (uid,), (h,)), at_day(10):
        w = wallet(client, h, "Cash")
        rent = category(client, h, "Rent", onceAMonth=True)
        budget(client, h, rent, 1000)
        spend(client, h, w, rent, 900)  # near, and this pace would run out early
        spend(client, h, w, rent, 100)  # used
        assert db_keys(uid) == set()
        spend(client, h, w, rent, 100)
        assert db_keys(uid) == {f"over:{rent}:{current_month()}"}


@needs_db
def test_run_out_fires_once_and_leaves_out_once_a_month():
    with users() as (client, (uid,), (h,)), at_day(10):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        month, key = current_month(), f"runout:monthly:{current_month()}"
        rent = category(client, h, "Rent", onceAMonth=True)
        budget(client, h, None, 10000)
        spend(client, h, w, rent, 8000)  # 80% of the budget, but nothing to project forward
        assert key not in db_keys(uid)
        spend(client, h, w, food, 1500)  # 1,500 of the 2,000 left for everyday spending, by day 10
        assert key in db_keys(uid)
        with connect() as conn:
            row = conn.execute("select title from notifications where user_id = %s and key = %s", (uid, key)).fetchone()
        assert short_date(runs_out(1500, 2000, month, today().replace(day=10).isoformat())) in row["title"]
        before = len(db_keys(uid))
        spend(client, h, w, food, 100)  # moves the date: still one run-out notification
        assert len(db_keys(uid)) == before


@needs_db
def test_run_out_leaves_out_unusual_purchases():
    with users() as (client, (uid,), (h,)), at_day(10):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        budget(client, h, food, 2000)
        for _ in range(3):
            spend(client, h, w, food, 10)
        spend(client, h, w, food, 1000)  # counted, it would run out on day 20; without it the pace lasts
        assert not [k for k in db_keys(uid) if k.startswith("runout:")]
        assert [k for k in db_keys(uid) if k.startswith("unusual:")]


@needs_db
def test_past_month_expense_fires_no_budget_row():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        budget(client, h, None, 1000)
        spend(client, h, w, food, 9000, date=f"{shift_month(current_month(), -1)}-15")
        assert db_keys(uid) == set()


@needs_db
def test_unusual_fires_only_without_a_decision():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        for _ in range(3):
            spend(client, h, w, food, 100)
        flagged = spend(client, h, w, food, 1000)
        assert db_keys(uid) == {f"unusual:{flagged}"}
        with connect() as conn:
            assert conn.execute("select link from notifications where user_id = %s", (uid,)).fetchone()["link"].startswith("/activity")

        other = category(client, h, "Pets")
        for _ in range(3):
            spend(client, h, w, other, 100)
        spend(client, h, w, other, 1000, anomalyDecision="one_off")  # already decided in the add form
        assert db_keys(uid) == {f"unusual:{flagged}"}

        res = client.put(f"/api/anomalies/{flagged}/decision", json={"decision": "one_off"}, headers=h)
        assert res.status_code == 200
        assert db_keys(uid) == {f"unusual:{flagged}"}  # deciding later leaves the row


@needs_db
def test_edit_that_newly_flags_a_purchase_fires():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        for _ in range(3):
            spend(client, h, w, food, 100)
        txn = spend(client, h, w, food, 120)
        assert db_keys(uid) == set()
        assert client.patch(f"/api/transactions/{txn}", json={"amount": 1000}, headers=h).status_code == 200
        assert db_keys(uid) == {f"unusual:{txn}"}


@needs_db
def test_switch_off_means_no_row():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        assert client.put("/api/notifications/settings", json={**ALL_ON, "nearLimit": False}, headers=h).status_code == 200
        budget(client, h, None, 1000)
        spend(client, h, w, food, 850)
        assert db_keys(uid) == set()
        assert client.get("/api/notifications", headers=h).json() == {"items": [], "unread": 0}


@needs_db
def test_delete_and_restore_fire_nothing():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        budget(client, h, None, 1000)
        spend(client, h, w, food, 850)
        extra = spend(client, h, w, food, 10)
        before = db_keys(uid)
        assert client.delete(f"/api/transactions/{extra}", headers=h).status_code == 204
        assert db_keys(uid) == before
        backup = client.get("/api/backup", headers=h).json()
        assert client.post("/api/backup/restore", json=backup, headers=h).status_code == 204
        assert db_keys(uid) == before


@needs_db
def test_check_failure_never_fails_the_save():
    with users() as (client, (uid,), (h,)), at_day(1):
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        with patch("notify.check_budgets", side_effect=RuntimeError("boom")):
            res = client.post("/api/transactions", headers=h, json=expense_body(w, food, 100))
        assert res.status_code == 201
        assert any(t["id"] == res.json()["id"] for t in client.get("/api/transactions", headers=h).json())


@needs_db
def test_list_read_and_privacy():
    with users(2) as (client, (user_a, user_b), (ha, hb)), at_day(1):
        w, food = wallet(client, ha, "Cash"), food_id(client, ha)
        budget(client, ha, None, 1000)
        spend(client, ha, w, food, 850)
        mine = client.get("/api/notifications", headers=ha).json()
        assert mine["unread"] == 1 and len(mine["items"]) == 1
        row = mine["items"][0]
        assert row["title"] and row["link"] == "/budgets" and row["createdAt"]
        assert row["kind"] == "near" and row["read"] is False
        assert client.get("/api/notifications", headers=hb).json() == {"items": [], "unread": 0}
        with user_tx(direct(user_b)) as conn:
            assert conn.execute("select count(*) as n from notifications").fetchone()["n"] == 0
        with user_tx(direct(user_a)) as conn:
            assert conn.execute("select count(*) as n from notifications").fetchone()["n"] == 1
        assert client.post("/api/notifications/read", headers=ha).status_code == 204
        mine = client.get("/api/notifications", headers=ha).json()
        assert mine["unread"] == 0 and len(mine["items"]) == 1 and mine["items"][0]["read"] is True


@needs_db
def test_settings_default_on_and_save():
    with users() as (client, (uid,), (h,)):
        assert client.get("/api/notifications/settings", headers=h).json() == ALL_ON
        off = {**ALL_ON, "nearLimit": False}
        assert client.put("/api/notifications/settings", json=off, headers=h).json() == off
        assert client.get("/api/notifications/settings", headers=h).json() == off
        assert client.put("/api/notifications/settings", json=ALL_ON, headers=h).json() == ALL_ON
        with connect() as conn:
            assert conn.execute("select count(*) as n from notification_settings where user_id = %s", (uid,)).fetchone()["n"] == 1


@contextmanager
def mail():
    """Email looks configured, and goes into a list instead of out."""
    sent = []
    fake = lambda to, subject, text, html: sent.append(SimpleNamespace(to=to, subject=subject, text=text, html=html))  # noqa: E731
    with patch("notify.email_ready", return_value=True), patch("notify.send_email", side_effect=fake):
        yield sent


def unsent(uid):
    with connect() as conn:
        return conn.execute("select count(*) as n from notifications where user_id = %s and emailed_at is null", (uid,)).fetchone()["n"]


@needs_db
def test_one_save_sends_one_email_to_the_signed_in_address():
    with users() as (client, (uid,), (h,)), at_day(1), mail() as sent:
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        budget(client, h, None, 1000)
        budget(client, h, food, 500)
        spend(client, h, w, food, 450)  # category near
        spend(client, h, w, food, 400)  # monthly near and category over: two rows, one email
        assert len(sent) == 2 and {s.to for s in sent} == {"test@example.com"}
        assert sent[1].subject == "AntTipid: 2 new notifications"
        assert unsent(uid) == 0


@needs_db
def test_budget_save_sends_email_too():
    with users() as (client, _, (h,)), at_day(1), mail() as sent:
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        spend(client, h, w, food, 500)
        assert sent == []
        budget(client, h, None, 550)
        assert len(sent) == 1


@needs_db
def test_failed_send_keeps_the_save_and_retries_next_save():
    with users() as (client, (uid,), (h,)), at_day(1), mail() as sent:
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        budget(client, h, None, 1000)
        with patch("notify.send_email", side_effect=OSError("smtp down")):
            res = client.post("/api/transactions", headers=h, json=expense_body(w, food, 850))
        assert res.status_code == 201 and unsent(uid) == 1
        spend(client, h, w, food, 5)
        assert len(sent) == 1 and unsent(uid) == 0


@needs_db
def test_master_switch_off_never_sends_old_rows():
    with users() as (client, (uid,), (h,)), at_day(1), mail() as sent:
        w, food = wallet(client, h, "Cash"), food_id(client, h)
        client.put("/api/notifications/settings", json={**ALL_ON, "emailEnabled": False}, headers=h)
        budget(client, h, None, 1000)
        spend(client, h, w, food, 850)
        assert client.get("/api/notifications", headers=h).json()["unread"] == 1 and sent == []
        client.put("/api/notifications/settings", json=ALL_ON, headers=h)
        spend(client, h, w, food, 5)
        assert sent == []


@needs_db
def test_rows_older_than_a_day_are_never_sent():
    with users() as (client, (uid,), (h,)), at_day(1), mail() as sent:
        with connect() as conn:
            conn.execute(
                "insert into notifications (user_id, key, kind, title, link, created_at)"
                " values (%s, 'old', 'near', 'Old', '/budgets', now() - interval '2 days')", (uid,),
            )
        spend(client, h, wallet(client, h, "Cash"), food_id(client, h), 5)
        assert sent == [] and unsent(uid) == 1


@needs_db
def test_user_text_stays_out_of_the_subject_recipient_and_html():
    with users() as (client, _, (h,)), at_day(1), mail() as sent:
        w = wallet(client, h, "Cash")
        pets = category(client, h, "<b>Pets</b>\nBcc: y@evil.test")
        budget(client, h, pets, 100)
        spend(client, h, w, pets, 90)
        assert sent[0].to == "test@example.com" and sent[0].subject == "AntTipid: 1 new notification"
        assert "<b>Pets" not in sent[0].html and "&lt;b&gt;Pets" in sent[0].html


def test_no_smtp_settings_means_no_send():
    with patch.dict(os.environ, {"SMTP_USER": "", "SMTP_APP_PASSWORD": ""}), patch("notify.send_email") as send:
        assert not email_ready()
        send_pending(direct("00000000-0000-0000-0000-000000000000"))
        send.assert_not_called()


def test_email_text_is_a_letter():
    budgets = [{"kind": "near", "title": "Food budget is at 90%", "body": "You've used ₱900 of ₱1,000.", "link": "/budgets"},
               {"kind": "run_out", "title": "Spending fast", "body": "Keep to ₱450 a day.", "link": "/budgets"}]
    with patch.dict(os.environ, {"APP_URL": "https://app.test/"}):
        subject, text, html = email_text(budgets)
    assert subject == "AntTipid: 2 new notifications"
    for part in (text, html):
        for words in ("Your budgets need a look", "Food budget is at 90%", "You've used ₱900 of ₱1,000.", "See your budgets",
                      "https://app.test/budgets", "Thank you,", "Your expense and budget tracker", "Manage notifications",
                      "https://app.test/settings?tab=notifications", "AntTipid"):
            assert words in part, words
    assert "<strong>Food budget is at 90%" in html

    unusual = {"kind": "unusual", "title": "Unusual purchase: ₱4,500 on Bills", "body": "", "link": "/activity?month=2026-11"}
    with patch.dict(os.environ, {"APP_URL": "https://app.test"}):
        one, both = email_text([unusual]), email_text([budgets[0], unusual])
    assert one[0] == "AntTipid: 1 new notification"
    assert "<h1" in one[2] and "Unusual purchase</h1>" in one[2] and "Open AntTipid" in one[2]
    assert "A few things need a look" in both[2] and "Open AntTipid" in both[2]


@needs_db
def test_test_email_limit_and_failures():
    with users(3) as (client, ids, (h1, h2, h3)), mail() as sent:
        assert client.post("/api/notifications/test", headers=h1).status_code == 204
        assert [s.to for s in sent] == ["test@example.com"]
        assert client.post("/api/notifications/test", headers=h1).status_code == 429
        assert len(sent) == 1
        # Users can't clear the limit through Supabase's REST API, and can still change their switches.
        for sql in ("update notification_settings set test_email_at = null",
                    "insert into notification_settings (user_id, test_email_at) values (auth.uid(), null)"):
            with pytest.raises(errors.InsufficientPrivilege), user_tx(direct(ids[0])) as conn:
                conn.execute(sql)
        assert client.put("/api/notifications/settings", json=ALL_ON, headers=h1).status_code == 200
        with patch("notify.email_ready", return_value=False):
            assert client.post("/api/notifications/test", headers=h2).status_code == 503
        with patch("notify.send_email", side_effect=OSError("smtp down")):
            assert client.post("/api/notifications/test", headers=h3).status_code == 502


def test_recap_body():
    text = recap_body(recap_runs("2026-10", 25000, 18200, 20000, "Food & dining", 7000))
    assert "In October" in text and "₱25,000" in text and "₱18,200" in text and "₱6,800" in text and "Food & dining" in text
    assert "You stayed ₱1,800 under your ₱20,000 monthly budget." in text
    assert "new month" in text.lower() and "November" in text  # the little reminder
    assert "monthly budget" not in recap_body(recap_runs("2026-10", 0, 500, None, "Food & dining", 500))
    assert "₱500 more than you earned" in recap_body(recap_runs("2026-10", 0, 500, None, "Food & dining", 500))


def test_recap_email():
    runs = recap_runs("2026-10", 25000, 18200, 20000, "Food & dining", 7000)
    with patch.dict(os.environ, {"APP_URL": "https://app.test"}):
        subject, text, html = recap_email("2026-10", runs)
    assert subject == "AntTipid: your October recap"
    for part in (text, html):
        for words in ("Your October recap", "https://app.test/reports?month=2026-10", "https://app.test/budgets", "Check your budgets"):
            assert words in part, words
    assert "<strong>₱6,800</strong>" in html and "<strong>Food &amp; dining</strong>" in html


def last_month_expense(client, h, amount=500):
    w, food = wallet(client, h, "Cash"), food_id(client, h)
    spend(client, h, w, food, amount, date=f"{shift_month(current_month(), -1)}-15")


@needs_db
def test_new_month_touches_only_the_given_users():
    with users(2) as (client, (a, b), (ha, hb)), at_day(1), mail():
        last_month_expense(client, ha)
        last_month_expense(client, hb)
        result = run_new_month(shift_month(current_month(), -1), only_users=[a])
        assert result == {"created": 1, "sent": 1}
        assert db_keys(a) == {f"new_month:{current_month()}"} and db_keys(b) == set()
        item = client.get("/api/notifications", headers=ha).json()["items"][0]
        assert item["link"] == f"/reports?month={shift_month(current_month(), -1)}"
        assert "new month" in item["body"].lower()


@needs_db
def test_new_month_rerun_is_safe():
    with users() as (client, (a,), (h,)), at_day(1), mail() as sent:
        last_month_expense(client, h)
        month = shift_month(current_month(), -1)
        assert run_new_month(month, only_users=[a]) == {"created": 1, "sent": 1}
        assert run_new_month(month, only_users=[a]) == {"created": 0, "sent": 0}
        assert len(sent) == 1 and sent[0].to == f"audit-{a[:8]}@example.com"


@needs_db
def test_new_month_skips_quiet_and_switched_off_users():
    with users(3) as (client, (quiet, off, no_email), (hq, ho, hn)), at_day(1), mail() as sent:
        last_month_expense(client, ho)
        last_month_expense(client, hn)
        client.put("/api/notifications/settings", json={**ALL_ON, "newMonth": False}, headers=ho)
        client.put("/api/notifications/settings", json={**ALL_ON, "emailEnabled": False}, headers=hn)
        result = run_new_month(shift_month(current_month(), -1), only_users=[quiet, off, no_email])
        assert result == {"created": 1, "sent": 0} and sent == []
        assert db_keys(quiet) == set() and db_keys(off) == set() and db_keys(no_email) == {f"new_month:{current_month()}"}
        assert unsent(no_email) == 0


@needs_db
def test_new_month_send_failure_retries_on_rerun():
    with users() as (client, (a,), (h,)), at_day(1), mail() as sent:
        last_month_expense(client, h)
        month = shift_month(current_month(), -1)
        with patch("notify.send_email", side_effect=OSError("smtp down")):
            assert run_new_month(month, only_users=[a]) == {"created": 1, "sent": 0}
        assert unsent(a) == 1
        assert run_new_month(month, only_users=[a]) == {"created": 0, "sent": 1}
        assert len(sent) == 1 and unsent(a) == 0


def test_cron_route_needs_the_secret():
    with patch.dict(os.environ, {"CRON_SECRET": "s3cret"}), patch("notify_routes.run_new_month", return_value={"created": 0, "sent": 0}) as run:
        client = TestClient(app)
        assert client.get("/api/cron/new-month").status_code == 401
        assert client.get("/api/cron/new-month", headers={"Authorization": "Bearer nope"}).status_code == 401
        assert client.get("/api/cron/new-month", headers={"Authorization": "Bearer s3cret"}).status_code == 200
        run.assert_called_once_with(shift_month(current_month(), -1))
    with patch.dict(os.environ, {"CRON_SECRET": ""}), patch("notify_routes.run_new_month") as run:
        assert TestClient(app).get("/api/cron/new-month", headers={"Authorization": "Bearer "}).status_code == 401
        run.assert_not_called()


if __name__ == "__main__":
    for name, test in list(globals().items()):
        if name.startswith("test_"):
            test()
    print("All notification checks passed")
