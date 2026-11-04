"""Audit log checks against the live database: triggers, the API, privacy and cleanup.

Run with: .venv/Scripts/python test_audit_backup.py
"""

import os
import uuid
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from dotenv import load_dotenv
from fastapi.testclient import TestClient
from psycopg import errors

load_dotenv(Path(__file__).with_name(".env"))

from auth import AuthUser  # noqa: E402
from db import connect, user_tx  # noqa: E402
from main import app  # noqa: E402
from test_receipts import TEST_SECRET, TEST_URL, _make_token  # noqa: E402

INSERT_SESSION = "insert into auth.sessions (id, user_id, created_at, updated_at, aal) values (%s, %s, now(), now(), 'aal1')"
SKIP = "Skipping audit tests (set DATABASE_URL in backend/.env to run them)"


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


def test_audit_records_each_change():
    if not os.environ.get("DATABASE_URL"):
        return print(SKIP)
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
        assert renamed["changes"] == {"name": ["GCash", "Maya"]} and renamed["entityId"] == wallet_id


def test_audit_skips_noise():
    if not os.environ.get("DATABASE_URL"):
        return print(SKIP)
    with users() as (client, _, (ha,)):
        assert client.get("/api/audit", headers=ha).json() == []  # 11 seeded categories are not entries
        w = wallet(client, ha, "Cash")
        assert client.patch(f"/api/wallets/{w}", json={"name": "Cash"}, headers=ha).status_code == 200
        assert [e["action"] for e in client.get("/api/audit", headers=ha).json()] == ["create"]


def test_audit_limit():
    if not os.environ.get("DATABASE_URL"):
        return print(SKIP)
    with users() as (client, _, (ha,)):
        for name in ("W1", "W2", "W3"):
            wallet(client, ha, name)
        assert [e["label"] for e in client.get("/api/audit?limit=2", headers=ha).json()] == ["W3", "W2"]
        assert client.get("/api/audit?limit=1001", headers=ha).status_code == 422


def test_audit_is_private_and_append_only():
    if not os.environ.get("DATABASE_URL"):
        return print(SKIP)
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


def test_audit_sign_in():
    if not os.environ.get("DATABASE_URL"):
        return print(SKIP)
    with users() as (client, (user_a,), (ha,)):
        session = uuid.uuid4()
        with connect() as conn:
            conn.execute(INSERT_SESSION, (session, user_a))
        assert client.get("/api/audit", headers=ha).json()[0]["action"] == "sign_in"
        with connect() as conn:  # a token refresh
            conn.execute("update auth.sessions set updated_at = now() + interval '1 minute' where id = %s", (session,))
        assert len(client.get("/api/audit", headers=ha).json()) == 1


def test_sign_in_survives_audit_failure():
    if not os.environ.get("DATABASE_URL"):
        return print(SKIP)
    with users() as (_, (user_a,), _):
        with connect() as conn:
            conn.execute("alter table public.audit_log add constraint t check (entity <> 'account') not valid")
            conn.execute(INSERT_SESSION, (uuid.uuid4(), user_a))  # must not raise
            conn.rollback()


def test_audit_goes_with_the_user():
    if not os.environ.get("DATABASE_URL"):
        return print(SKIP)
    with users() as (client, (user_a,), (ha,)):
        w = wallet(client, ha, "Cash")
        assert client.post("/api/budgets", json={"categoryId": None, "limit": 1000, "warnAt": 80}, headers=ha).status_code == 204
        expense(client, ha, w, food_id(client, ha))
        with connect() as conn:
            assert conn.execute("select count(*) as n from audit_log where user_id = %s", (user_a,)).fetchone()["n"] == 3
            conn.execute("delete from auth.users where id = %s", (user_a,))  # must not raise
            assert conn.execute("select count(*) as n from audit_log where user_id = %s", (user_a,)).fetchone()["n"] == 0


if __name__ == "__main__":
    test_audit_records_each_change()
    test_audit_skips_noise()
    test_audit_limit()
    test_audit_is_private_and_append_only()
    test_audit_sign_in()
    test_sign_in_survives_audit_failure()
    test_audit_goes_with_the_user()
    print("All audit checks passed")
