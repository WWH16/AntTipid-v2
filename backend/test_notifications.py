"""Notification checks: the rules, what gets stored, what gets emailed. Never sends real email.

Run with: .venv/Scripts/python test_notifications.py
"""

from unittest.mock import patch

from db import connect, user_tx
from months import current_month, shift_month, today
from notify import budget_state, end_line, runs_out, short_date
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
        assert row["kind"] == "near" and row["title"] and row["link"] == "/budgets" and row["readAt"] is None and row["createdAt"]
        assert client.get("/api/notifications", headers=hb).json() == {"items": [], "unread": 0}
        with user_tx(direct(user_b)) as conn:
            assert conn.execute("select count(*) as n from notifications").fetchone()["n"] == 0
        with user_tx(direct(user_a)) as conn:
            assert conn.execute("select count(*) as n from notifications").fetchone()["n"] == 1
        assert client.post("/api/notifications/read", headers=ha).status_code == 204
        mine = client.get("/api/notifications", headers=ha).json()
        assert mine["unread"] == 0 and mine["items"][0]["readAt"]


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


if __name__ == "__main__":
    for name, test in list(globals().items()):
        if name.startswith("test_"):
            test()
    print("All notification checks passed")
