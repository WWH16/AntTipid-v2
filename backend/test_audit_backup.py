"""Audit log checks against the live database: triggers, the API, privacy and cleanup.

Run with: .venv/Scripts/python test_audit_backup.py
"""

import os
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import jwt
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from psycopg import errors
from pydantic import ValidationError

load_dotenv(Path(__file__).with_name(".env"))

from auth import AuthUser  # noqa: E402
from backup import leftover_photos, own_receipt  # noqa: E402
from db import connect, user_tx  # noqa: E402
from main import app  # noqa: E402
from models import BackupFile  # noqa: E402
from months import current_month, month_range, shift_month, today  # noqa: E402
from test_receipts import TEST_SECRET, TEST_URL, _make_token  # noqa: E402

INSERT_SESSION = "insert into auth.sessions (id, user_id, created_at, updated_at, aal) values (%s, %s, now(), now(), 'aal1')"


def needs_db(test):
    """Skip a test when there is no database to run it against."""
    def run():
        if not os.environ.get("DATABASE_URL"):
            return print(f"Skipping {test.__name__} (set DATABASE_URL in backend/.env to run it)")
        test()
    return run


def direct(uid):
    return AuthUser(id=uid, token="", claims={"sub": uid, "role": "authenticated"})


@contextmanager
def users(n=1):
    """Throwaway signed-in users and a client; the users are deleted at the end, even on failure."""
    ids = [str(uuid.uuid4()) for _ in range(n)]
    with connect() as conn:
        for uid in ids:
            conn.execute(
                "insert into auth.users (id, email, aud, role, created_at, updated_at) values "
                "(%s, %s, 'authenticated', 'authenticated', now(), now())",
                (uid, f"audit-{uid[:8]}@example.com"),
            )
    try:
        with patch.dict(os.environ, {"SUPABASE_URL": TEST_URL, "SUPABASE_JWT_SECRET": TEST_SECRET}):
            yield TestClient(app), ids, [{"Authorization": f"Bearer {_make_token(uid)}"} for uid in ids]
    finally:
        with connect() as conn:
            conn.execute("delete from auth.users where id = any(%s::uuid[])", (ids,))


def wallet(client, h, name):
    return client.post("/api/wallets", json={"name": name, "type": "cash", "balance": 0}, headers=h).json()["id"]


def expense(client, h, wallet_id, category_id, amount=250, title="Jollibee"):
    return client.post("/api/transactions", headers=h, json={
        "kind": "expense", "amount": amount, "title": title, "date": "2026-10-15",
        "walletId": wallet_id, "categoryId": category_id, "note": "", "source": "manual",
    }).json()["id"]


def food_id(client, h):
    return next(c["id"] for c in client.get("/api/categories", headers=h).json() if c["name"] == "Food & dining")


@needs_db
def test_audit_records_each_change():
    with users() as (client, _, (ha,)):
        food = food_id(client, ha)
        wallet_id = wallet(client, ha, "GCash")
        assert client.patch(f"/api/wallets/{wallet_id}", json={"name": "Maya"}, headers=ha).status_code == 200
        txn = expense(client, ha, wallet_id, food)
        assert client.patch(f"/api/transactions/{txn}", json={"amount": 300}, headers=ha).status_code == 200
        assert client.delete(f"/api/transactions/{txn}", headers=ha).status_code == 204
        assert client.post("/api/budgets", json={"categoryId": None, "limit": 10000, "warnAt": 80}, headers=ha).status_code == 204
        assert client.post("/api/budgets", json={"categoryId": food, "limit": 2000, "warnAt": 80}, headers=ha).status_code == 204

        log = client.get("/api/audit", headers=ha).json()
        assert [e["action"] for e in log][:3] == ["create", "create", "delete"]  # category budget, monthly budget, delete
        assert log[0]["label"] == "Food & dining" and log[1]["label"] == "Monthly budget"
        assert log[2]["entity"] == "transaction" and log[2]["label"] == "Jollibee"  # the name outlives the row
        changed = next(e for e in log if e["entity"] == "transaction" and e["action"] == "update")
        assert changed["changes"] == {"amount": [250, 300]}
        renamed = next(e for e in log if e["entity"] == "wallet" and e["action"] == "update")
        assert renamed["changes"] == {"name": ["GCash", "Maya"]}


@needs_db
def test_audit_skips_noise():
    with users() as (client, _, (ha,)):
        assert client.get("/api/audit", headers=ha).json() == []  # 11 seeded categories are not entries
        w = wallet(client, ha, "Cash")
        assert client.patch(f"/api/wallets/{w}", json={"name": "Cash"}, headers=ha).status_code == 200
        assert [e["action"] for e in client.get("/api/audit", headers=ha).json()] == ["create"]


@needs_db
def test_audit_limit():
    with users() as (client, _, (ha,)):
        for name in ("W1", "W2", "W3"):
            wallet(client, ha, name)
        assert [e["label"] for e in client.get("/api/audit?limit=2", headers=ha).json()] == ["W3", "W2"]
        assert client.get("/api/audit?limit=1001", headers=ha).status_code == 422


@needs_db
def test_audit_keeps_what_was_added_and_deleted():
    with users() as (client, _, (ha,)):
        food = food_id(client, ha)
        txn = expense(client, ha, wallet(client, ha, "GCash"), food)
        assert client.delete(f"/api/transactions/{txn}", headers=ha).status_code == 204
        deleted, added = client.get("/api/audit", headers=ha).json()[:2]
        kept = {"kind": "expense", "amount": 250, "date": "2026-10-15", "wallet_id": "GCash", "category_id": "Food & dining"}
        assert added["changes"] == {k: [None, v] for k, v in kept.items()}
        assert deleted["changes"] == {k: [v, None] for k, v in kept.items()}
        # A budget's label already names its category.
        assert client.post("/api/budgets", json={"categoryId": food, "limit": 2000, "warnAt": 80}, headers=ha).status_code == 204
        assert client.get("/api/audit", headers=ha).json()[0]["changes"] == {"limit_amount": [None, 2000], "warn_at": [None, 80]}


@needs_db
def test_audit_names_a_changed_wallet_and_category():
    with users() as (client, _, (ha,)):
        gcash, maya = wallet(client, ha, "GCash"), wallet(client, ha, "Maya")
        txn = expense(client, ha, gcash, food_id(client, ha))
        assert client.patch(f"/api/transactions/{txn}", json={"walletId": maya}, headers=ha).status_code == 200
        assert client.get("/api/audit", headers=ha).json()[0]["changes"] == {"wallet_id": ["GCash", "Maya"]}


@needs_db
def test_audit_filter():
    with users() as (client, _, (ha,)):
        expense(client, ha, wallet(client, ha, "GCash"), food_id(client, ha))
        assert [e["entity"] for e in client.get("/api/audit?entity=wallet", headers=ha).json()] == ["wallet"]
        assert [e["entity"] for e in client.get("/api/audit", headers=ha).json()] == ["transaction", "wallet"]
        assert client.get("/api/audit?entity=nope", headers=ha).status_code == 422


@needs_db
def test_audit_is_private_and_append_only():
    with users(2) as (client, (user_a, _), (ha, hb)):
        wallet(client, ha, "Cash")
        assert client.get("/api/audit", headers=hb).json() == []
        for sql in ("delete from audit_log", "update audit_log set label = 'x'",
                    "insert into audit_log (user_id, action, entity) values (auth.uid(), 'sign_in', 'account')"):
            try:
                with user_tx(direct(user_a)) as conn:
                    conn.execute(sql)
                raise AssertionError(sql)
            except errors.InsufficientPrivilege:
                pass


@needs_db
def test_audit_sign_in():
    with users() as (client, (user_a,), (ha,)):
        session = uuid.uuid4()
        with connect() as conn:
            conn.execute(INSERT_SESSION, (session, user_a))
        assert client.get("/api/audit", headers=ha).json()[0]["action"] == "sign_in"
        with connect() as conn:  # a token refresh
            conn.execute("update auth.sessions set updated_at = now() + interval '1 minute' where id = %s", (session,))
        assert len(client.get("/api/audit", headers=ha).json()) == 1


@needs_db
def test_sign_in_survives_audit_failure():
    with users() as (_, (user_a,), _):
        with connect() as conn:
            conn.execute("alter table public.audit_log add constraint t check (entity <> 'account') not valid")
            conn.execute(INSERT_SESSION, (uuid.uuid4(), user_a))  # must not raise
            conn.rollback()


@needs_db
def test_audit_goes_with_the_user():
    with users() as (client, (user_a,), (ha,)):
        w = wallet(client, ha, "Cash")
        assert client.post("/api/budgets", json={"categoryId": None, "limit": 1000, "warnAt": 80}, headers=ha).status_code == 204
        expense(client, ha, w, food_id(client, ha))
        with connect() as conn:
            assert conn.execute("select count(*) as n from audit_log where user_id = %s", (user_a,)).fetchone()["n"] == 3
            conn.execute("delete from auth.users where id = %s", (user_a,))  # must not raise
            assert conn.execute("select count(*) as n from audit_log where user_id = %s", (user_a,)).fetchone()["n"] == 0


def _uid(h):
    return jwt.decode(h["Authorization"].split()[1], options={"verify_signature": False})["sub"]


def _seed(client, h):
    """Two wallets (one archived), a once-a-month category, income, an expense with items, a transfer, both kinds of
    budget, a kept anomaly verdict and a past month's budget history. Returns the expense's id."""
    month = month_range(current_month())[0]
    day = lambda n: month.replace(day=n).isoformat()  # noqa: E731
    cats = {c["name"]: c["id"] for c in client.get("/api/categories", headers=h).json()}
    cash, old = wallet(client, h, "Cash"), wallet(client, h, "Old bank")
    assert client.patch(f"/api/wallets/{cash}", json={"balance": 500}, headers=h).status_code == 200
    assert client.patch(f"/api/wallets/{old}", json={"archived": True}, headers=h).status_code == 200
    made = client.post("/api/categories", json={"name": "Rent", "kind": "expense", "icon": "home", "onceAMonth": True}, headers=h)
    assert made.status_code == 201
    base = {"note": "", "source": "manual", "walletId": cash}
    assert client.post("/api/transactions", headers=h, json={
        **base, "kind": "income", "amount": 9000, "title": "Pay", "date": day(1), "categoryId": cats["Salary"]}).status_code == 201
    spent = client.post("/api/transactions", headers=h, json={
        **base, "kind": "expense", "amount": 250.5, "title": "Jollibee", "date": day(2), "categoryId": cats["Food & dining"],
        "note": "lunch", "items": [{"name": "Burger", "qty": 2, "price": 75.25}, {"name": "Fries", "qty": 1, "price": 100}]})
    assert spent.status_code == 201
    assert client.post("/api/transactions", headers=h, json={
        **base, "kind": "transfer", "amount": 100, "title": "Move", "date": day(3), "toWalletId": old}).status_code == 201
    assert client.post("/api/budgets", json={"categoryId": None, "limit": 10000, "warnAt": 80}, headers=h).status_code == 204
    assert client.post("/api/budgets", json={"categoryId": cats["Food & dining"], "limit": 2000, "warnAt": 70}, headers=h).status_code == 204
    txn = spent.json()["id"]
    with connect() as conn:
        conn.execute(
            "insert into anomaly_checks (transaction_id, user_id, unusual, decision, method, usual_low, usual_high)"
            " values (%s, %s, true, 'one_off', 'simple', 10, 100)"
            " on conflict (transaction_id) do update set unusual = true, decision = 'one_off', method = 'simple',"
            " usual_low = 10, usual_high = 100",
            (txn, _uid(h)),
        )
        conn.execute(
            "insert into budget_history (user_id, category_id, month, limit_amount) values (%s, null, %s, 8000)",
            (_uid(h), month_range(shift_month(current_month(), -1))[0]),
        )
    return txn


def _view(client, h):
    """Everything the user sees, with ids replaced by names so two accounts (or two restores) compare equal."""
    get = lambda url: client.get(url, headers=h).json()  # noqa: E731
    month = current_month()
    wallets, cats, txns = get("/api/wallets"), get("/api/categories"), get("/api/transactions")
    names = {x["id"]: x["name"] for x in wallets + cats} | {t["id"]: t["title"] for t in txns}
    seen = {"wallets": wallets, "categories": cats, "transactions": txns, "budgets": get(f"/api/budgets?month={month}"),
            "report": get(f"/api/reports/monthly?month={month}"), "anomalies": get(f"/api/anomalies?month={month}")}

    def rename(v):
        if isinstance(v, dict):
            return {k: rename(x) for k, x in v.items() if k != "id"}
        if isinstance(v, list):
            return [rename(x) for x in v]
        return names.get(v, v)

    with connect() as conn:
        history = conn.execute(
            "select c.name, h.month, h.limit_amount from budget_history h left join categories c on c.id = h.category_id"
            " where h.user_id = %s order by c.name nulls first, h.month", (_uid(h),)).fetchall()
    return rename(seen), [(r["name"], r["month"], r["limit_amount"]) for r in history]


def _file(wallet_id, cat_id):
    stamp = "2026-11-01T00:00:00Z"
    row = {"id": str(uuid.uuid4()), "kind": "expense", "amount": 5, "title": "x", "date": "2026-11-01",
           "walletId": wallet_id, "toWalletId": None, "categoryId": cat_id, "note": "", "source": "manual", "receiptPath": None,
           "createdAt": stamp, "anomaly": None}
    return {"app": "anttipid", "version": 1, "exportedOn": "2026-11-01",
            "wallets": [{"id": wallet_id, "name": "Cash", "type": "cash", "openingBalance": 0, "archived": False, "createdAt": stamp}],
            "categories": [{"id": cat_id, "name": "Food", "kind": "expense", "icon": "food", "onceAMonth": False, "createdAt": stamp}],
            "transactions": [row], "budgets": [], "budgetHistory": []}


def _audit_count(client, h):
    return len(client.get("/api/audit?limit=1000", headers=h).json())


def test_leftover_photos():
    """After a restore: photos no transaction uses go, but not one saved since the restore began, nor folder markers."""
    started = datetime(2026, 11, 6, 10, 0, tzinfo=timezone.utc)
    files = [
        {"id": "1", "name": "kept.webp", "updated_at": "2026-11-05T09:00:00Z"},
        {"id": "2", "name": "gone.webp", "updated_at": "2026-11-05T09:00:00Z"},
        {"id": "3", "name": "new.webp", "updated_at": "2026-11-06T10:00:01Z"},
        {"id": None, "name": ".emptyFolderPlaceholder", "updated_at": None},
    ]
    assert leftover_photos("u1", files, {"u1/kept.webp"}, started) == ["u1/gone.webp"]


def test_own_receipt():
    uid = str(uuid.uuid4()); txn = str(uuid.uuid4())
    assert own_receipt(f"{uid}/{txn}.webp", uid) == f"{uid}/{txn}.webp"
    for bad in (None, f"{uuid.uuid4()}/{txn}.webp", f"{uid}/../{txn}.webp", f"{uid}/{txn}.exe", f"{uid}/{txn}.webp\n"):
        assert own_receipt(bad, uid) is None


def test_backup_file_rejects_damage():
    wallet_id, cat_id, ghost = (str(uuid.uuid4()) for _ in range(3))
    stamp = "2026-11-01T00:00:00Z"
    good = _file(wallet_id, cat_id)
    BackupFile.model_validate(good)
    row = good["transactions"][0]
    for damage in ({"app": "other"}, {"version": 2},
                   {"transactions": [{**row, "walletId": ghost}]},
                   {"transactions": [{**row, "categoryId": ghost}]},
                   {"budgets": [{"categoryId": ghost, "limit": 5, "warnAt": 80, "createdAt": stamp}]},
                   {"budgetHistory": [{"categoryId": ghost, "month": "2026-10-01", "limit": 5}]}):
        try:
            BackupFile.model_validate({**good, **damage})
            raise AssertionError(damage)
        except ValidationError:
            pass


@needs_db
def test_backup_round_trip():
    with users() as (client, _, (ha,)):
        spent = _seed(client, ha)
        before = _view(client, ha)
        res = client.get("/api/backup", headers=ha)
        assert f"anttipid-backup-{today()}.json" in res.headers["content-disposition"]
        backup = res.json()
        assert backup["app"] == "anttipid" and backup["version"] == 1 and len(backup["transactions"]) == 3
        item_txn = next(t for t in backup["transactions"] if t["id"] == spent)
        assert [i["name"] for i in item_txn["items"]] == ["Burger", "Fries"] and item_txn["anomaly"]["decision"] == "one_off"
        # change things after the backup: add a wallet, delete a transaction
        wallet(client, ha, "Extra")
        assert client.delete(f"/api/transactions/{spent}", headers=ha).status_code == 204
        entries = _audit_count(client, ha)
        done = client.post("/api/backup/restore", json=backup, headers=ha)
        assert done.status_code == 204
        assert _view(client, ha) == before
        log = client.get("/api/audit?limit=1000", headers=ha).json()
        assert len(log) == entries + 1 and log[0]["action"] == "restore" and log[0]["label"] == "3 transactions"


@needs_db
def test_restore_failure_changes_nothing():
    with users() as (client, _, (ha,)):
        _seed(client, ha)
        before = _view(client, ha)
        backup = client.get("/api/backup", headers=ha).json()
        entries = _audit_count(client, ha)
        # a transfer with a category passes the file's checks and fails the database's, after the deletes have run
        transfer = next(t for t in backup["transactions"] if t["kind"] == "transfer")
        backup["transactions"].append({**transfer, "categoryId": backup["categories"][0]["id"]})
        assert client.post("/api/backup/restore", json=backup, headers=ha).status_code == 422
        assert _view(client, ha) == before
        assert _audit_count(client, ha) == entries


@needs_db
def test_restore_rejects_damaged_file():
    with users() as (client, _, (ha,)):
        _seed(client, ha)
        before = _view(client, ha)
        backup = client.get("/api/backup", headers=ha).json()
        backup["wallets"] = backup["wallets"][1:]
        assert client.post("/api/backup/restore", json=backup, headers=ha).status_code == 422
        assert _view(client, ha) == before


@needs_db
def test_restore_other_accounts_backup():
    with users(2) as (client, (user_a, user_b), (ha, hb)):
        spent = _seed(client, ha)
        with connect() as conn:  # A's expense has a photo; B must not end up pointing at it
            conn.execute("update transactions set receipt_path = %s where id = %s", (f"{user_a}/{uuid.uuid4()}.webp", spent))
        a_before = _view(client, ha)
        backup = client.get("/api/backup", headers=ha).json()
        assert client.post("/api/backup/restore", json=backup, headers=hb).status_code == 204
        assert _view(client, ha) == a_before
        assert _view(client, hb) == a_before
        count = "select count(*) as n from transactions where user_id = %s and receipt_path is not null"
        with connect() as conn:
            assert conn.execute(count, (user_b,)).fetchone()["n"] == 0
            assert conn.execute(count, (user_a,)).fetchone()["n"] == 1


@needs_db
def test_restore_audit_label_singular():
    with users() as (client, _, (ha,)):
        one = _file(str(uuid.uuid4()), str(uuid.uuid4()))
        assert client.post("/api/backup/restore", json=one, headers=ha).status_code == 204
        assert client.get("/api/audit?limit=1", headers=ha).json()[0]["label"] == "1 transaction"


@needs_db
def test_restore_many_rows():
    with users() as (client, _, (ha,)):
        wallet_id, cat_id = str(uuid.uuid4()), str(uuid.uuid4())
        big = _file(wallet_id, cat_id)
        row = big["transactions"][0]
        big["transactions"] = [{**row, "id": str(uuid.uuid4()), "title": f"t{n}", "date": "2026-10-15"} for n in range(5000)]
        started = time.time()
        res = client.post("/api/backup/restore", json=big, headers=ha)
        elapsed = time.time() - started
        assert res.status_code == 204
        assert elapsed < 30
        print(f"restore of 5,000 rows took {elapsed:.1f}s")


if __name__ == "__main__":
    for name, test in list(globals().items()):
        if name.startswith("test_"):
            test()
    print("All audit checks passed")
