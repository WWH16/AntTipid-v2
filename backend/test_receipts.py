"""Backend self-checks: receipt parsing, JWT auth, every route group, and user A vs user B isolation.

Run with:
  .venv/Scripts/python test_receipts.py
  .venv/Scripts/python -m pytest
"""

import os
import time
import uuid
from datetime import date
from pathlib import Path
from unittest.mock import patch

import httpx
import jwt
from dotenv import load_dotenv
from fastapi.testclient import TestClient

load_dotenv(Path(__file__).with_name(".env"))

import storage  # noqa: E402
from auth import verify_token  # noqa: E402
from db import connect  # noqa: E402
from main import app  # noqa: E402
from receipts import NotAReceipt, normalize_scan  # noqa: E402

TEST_SECRET = "test-jwt-secret-at-least-32-bytes-long!"
TEST_URL = os.environ.get("SUPABASE_URL") or "https://example.supabase.co"
# Minimal valid 1x1 WebP image
TINY_WEBP = (
    b"RIFF$\x00\x00\x00WEBPVP8 \x18\x00\x00\x000\x01\x00\x9d\x01*\x01\x00\x01\x00\x02\x004%\xa4\x00\x03p\x00\xfe\xfb\x94\x00\x00"
)


def _make_token(user_id: str, email: str = "test@example.com", secret: str = TEST_SECRET, exp_offset: int = 3600) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": user_id,
            "email": email,
            "role": "authenticated",
            "aud": "authenticated",
            "iss": f"{TEST_URL.rstrip('/')}/auth/v1",
            "iat": now,
            "exp": now + exp_offset,
        },
        secret,
        algorithm="HS256",
    )


def test_receipt_normalization():
    # Well-formed reply: items add up, camelCase JSON out
    sm = normalize_scan({
        "merchant": "SM Supermarket", "date": "2026-08-19", "total": 209.2, "category": "Groceries",
        "paymentMethod": "e_wallet", "paymentLabel": "GCash",
        "items": [{"name": "EcoBag", "qty": 1, "price": 5}, {"name": "Cheese Buns", "qty": 1, "price": 57.25},
                  {"name": "Sbrit Heavy Duty", "qty": 1, "price": 69}, {"name": "Croley Butter Cream", "qty": 1, "price": 77.95}],
    })
    assert sm.low_confidence is False
    out = sm.model_dump(by_alias=True)
    assert out["suggestedCategoryId"] == "groceries" and out["paymentLabel"] == "GCash" and out["lowConfidence"] is False

    # Custom user categories matched by name (UUID keys)
    custom_cats = {"11111111-1111-1111-1111-111111111111": "Groceries"}
    matched = normalize_scan({"merchant": "SM", "date": "2026-08-19", "total": 100, "category": "groceries"}, custom_cats)
    assert matched.suggested_category_id == "11111111-1111-1111-1111-111111111111"

    # Sloppy reply: string numbers, unknown category, bad date, bad payment type, junk items, items not adding up
    sloppy = normalize_scan({
        "merchant": "  ", "date": "19/08/26", "total": "208.20", "category": "Snacks", "paymentMethod": "gcash",
        "items": [{"name": "Rice", "qty": "2", "price": "50"}, {"name": "", "price": 10}, {"name": "Free bag", "price": 0}, "junk"],
    })
    assert (sloppy.merchant, sloppy.date, sloppy.total) == ("Receipt", date.today().isoformat(), 208.2)
    assert [(i.name, i.qty, i.price) for i in sloppy.items] == [("Rice", 2, 50)]
    assert (sloppy.suggested_category_id, sloppy.payment_method, sloppy.low_confidence) == (None, None, True)

    # Not a receipt
    for reply in ({"total": 0}, {}, {"total": "abc"}):
        try:
            normalize_scan(reply)
            raise AssertionError(f"expected NotAReceipt for {reply}")
        except NotAReceipt:
            pass


def test_auth_jwt_verification():
    uid = str(uuid.uuid4())
    with patch.dict(os.environ, {"SUPABASE_URL": TEST_URL, "SUPABASE_JWT_SECRET": TEST_SECRET}):
        claims = verify_token(_make_token(uid, "andrea@example.com"))
        assert claims["sub"] == uid and claims["email"] == "andrea@example.com"

        client = TestClient(app)
        assert client.get("/api/wallets").status_code == 401
        assert client.get("/api/wallets", headers={"Authorization": f"Bearer {_make_token(uid, exp_offset=-120)}"}).status_code == 401


def test_wallet_patch_accepts_type_and_balance():
    import pytest
    from pydantic import ValidationError
    from models import ReceiptItem, TransactionIn, WalletPatch

    patch_in = WalletPatch.model_validate({"name": "Pocket Cash", "type": "savings", "balance": 1250.5})
    assert patch_in.model_dump(exclude_unset=True) == {"name": "Pocket Cash", "type": "savings", "balance": 1250.5}

    with pytest.raises(ValidationError):
        TransactionIn.model_validate({
            "kind": "expense", "amount": 100, "title": "Lunch", "date": "2026-10-20",
            "walletId": str(uuid.uuid4()), "categoryId": str(uuid.uuid4()),
            "items": [{"name": "Rice", "qty": 1e9, "price": 50}],
        })


def test_routes_and_user_isolation():
    if not os.environ.get("DATABASE_URL"):
        print("Skipping live DB route tests (set DATABASE_URL in backend/.env to run them)")
        return

    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    with connect() as conn:
        conn.execute(
            "insert into auth.users (id, email, aud, role, created_at, updated_at) values "
            "(%s, %s, 'authenticated', 'authenticated', now(), now()), "
            "(%s, %s, 'authenticated', 'authenticated', now(), now())",
            (user_a, f"a-{user_a[:8]}@example.com", user_b, f"b-{user_b[:8]}@example.com"),
        )

    try:
        with patch.dict(os.environ, {"SUPABASE_URL": TEST_URL, "SUPABASE_JWT_SECRET": TEST_SECRET}):
            client = TestClient(app)
            ha = {"Authorization": f"Bearer {_make_token(user_a, 'a@example.com')}"}
            hb = {"Authorization": f"Bearer {_make_token(user_b, 'b@example.com')}"}

            # 1. Categories: seeded defaults on sign-up, create, patch, delete
            cats_a = client.get("/api/categories", headers=ha).json()
            assert len(cats_a) == 11, f"expected 11 seeded categories, got {len(cats_a)}"
            food_id = next(c["id"] for c in cats_a if c["name"] == "Food & dining")
            salary_id = next(c["id"] for c in cats_a if c["name"] == "Salary")

            new_cat = client.post("/api/categories", json={"name": "Pets", "kind": "expense", "icon": "other"}, headers=ha)
            assert new_cat.status_code == 201
            pet_id = new_cat.json()["id"]
            patched_cat = client.patch(f"/api/categories/{pet_id}", json={"name": "Pets & vet", "icon": "health"}, headers=ha).json()
            assert patched_cat["name"] == "Pets & vet" and patched_cat["icon"] == "health"
            assert client.delete(f"/api/categories/{pet_id}", headers=ha).status_code == 204

            # 2. Wallets: create, list with computed balance, update
            w1 = client.post("/api/wallets", json={"name": "GCash", "type": "e_wallet", "balance": 1000}, headers=ha).json()
            w2 = client.post("/api/wallets", json={"name": "Cash", "type": "cash", "balance": 500}, headers=ha).json()
            assert w1["balance"] == 1000 and w2["balance"] == 500
            assert client.patch(f"/api/wallets/{w2['id']}", json={"name": "Pocket Cash"}, headers=ha).json()["name"] == "Pocket Cash"

            # 3. Transactions: income, expense with receipt items, transfer, filters, CSV, receipt photo
            inc = client.post("/api/transactions", headers=ha, json={
                "kind": "income", "amount": 5000, "title": "Payroll", "date": "2026-10-01",
                "walletId": w1["id"], "categoryId": salary_id, "note": "", "source": "manual",
            }).json()
            exp = client.post("/api/transactions", headers=ha, json={
                "kind": "expense", "amount": 250, "title": "Jollibee", "date": "2026-10-15",
                "walletId": w1["id"], "categoryId": food_id, "note": "Lunch", "source": "receipt",
                "items": [{"name": "Chickenjoy", "qty": 1, "price": 250}],
            }).json()
            xfr = client.post("/api/transactions", headers=ha, json={
                "kind": "transfer", "amount": 300, "title": "Withdraw", "date": "2026-10-16",
                "walletId": w1["id"], "toWalletId": w2["id"], "note": "", "source": "manual",
            }).json()
            assert exp["items"] == [{"name": "Chickenjoy", "qty": 1, "price": 250}]

            # Wallet balances reflect income (+5000), expense (-250), and transfer (-300 / +300)
            balances = {w["id"]: w["balance"] for w in client.get("/api/wallets", headers=ha).json()}
            assert balances[w1["id"]] == 1000 + 5000 - 250 - 300
            assert balances[w2["id"]] == 500 + 300

            # Reconciling a wallet's balance and changing its type adjusts opening_balance so the shown balance matches
            reconciled = client.patch(
                f"/api/wallets/{w2['id']}", json={"name": "Pocket Cash", "type": "savings", "balance": 1250.5}, headers=ha
            ).json()
            assert reconciled["type"] == "savings" and reconciled["balance"] == 1250.5
            assert next(w["balance"] for w in client.get("/api/wallets", headers=ha).json() if w["id"] == w2["id"]) == 1250.5

            # Search finds receipt line items; category in use cannot be deleted (409)
            found = client.get("/api/transactions", params={"month": "2026-10", "search": "chickenjoy"}, headers=ha).json()
            assert [t["id"] for t in found] == [exp["id"]]
            assert client.delete(f"/api/categories/{food_id}", headers=ha).status_code == 409

            # CSV export
            csv_res = client.get("/api/transactions/export.csv", params={"month": "2026-10"}, headers=ha)
            assert csv_res.status_code == 200 and "Jollibee" in csv_res.text and "Pocket Cash" in csv_res.text

            # Receipt photo validation (415 non-image, 413 >1MB) + upload + signed URL + delete cleanup
            assert client.post(
                f"/api/transactions/{exp['id']}/receipt",
                files={"image": ("bad.txt", b"not an image", "text/plain")}, headers=ha,
            ).status_code == 415
            assert client.post(
                f"/api/transactions/{exp['id']}/receipt",
                files={"image": ("huge.webp", TINY_WEBP + b"0" * (1024 * 1024 + 10), "image/webp")}, headers=ha,
            ).status_code == 413

            stored: dict[str, bytes] = {}
            with (
                patch.object(storage, "upload", side_effect=lambda _u, p, d, _ct: stored.__setitem__(p, d)),
                patch.object(storage, "signed_url", side_effect=lambda _u, p: f"https://signed.local/{p}" if p in stored else None),
                patch.object(storage, "remove", side_effect=lambda _u, path: stored.pop(path, None)),
            ):
                up = client.post(
                    f"/api/transactions/{exp['id']}/receipt",
                    files={"image": ("receipt.webp", TINY_WEBP, "image/webp")}, headers=ha,
                )
                assert up.status_code == 204
                expected_path = f"{user_a}/{exp['id']}.webp"
                assert expected_path in stored

                detail = client.get(f"/api/transactions/{exp['id']}", headers=ha).json()
                assert detail["receiptUrl"] == f"https://signed.local/{expected_path}"

            # 4. Budgets & 5. Reports
            assert client.post("/api/budgets", json={"categoryId": None, "limit": 10000, "warnAt": 80}, headers=ha).status_code == 204
            assert client.post("/api/budgets", json={"categoryId": food_id, "limit": 2000, "warnAt": 75}, headers=ha).status_code == 204
            b_list = client.get("/api/budgets", params={"month": "2026-10"}, headers=ha).json()
            assert len(b_list) == 2 and b_list[0]["categoryId"] is None and b_list[0]["spent"] == 250
            assert b_list[1]["categoryId"] == food_id and b_list[1]["spent"] == 250

            rep_sum = client.get("/api/reports/summary", params={"month": "2026-10"}, headers=ha).json()
            assert rep_sum["income"] == 5000 and rep_sum["spent"] == 250 and rep_sum["budget"] == 10000
            rep_mon = client.get("/api/reports/monthly", params={"month": "2026-10"}, headers=ha).json()
            assert rep_mon["byCategory"] == [{"categoryId": food_id, "total": 250}]
            assert len(rep_mon["trend"]) == 6 and rep_mon["trend"][-1] == {"month": "2026-10", "income": 5000, "spent": 250}

            # 6. User isolation: User B cannot see or touch any of User A's rows
            assert client.get("/api/wallets", headers=hb).json() == []
            assert client.get("/api/transactions", headers=hb).json() == []
            assert client.get("/api/budgets", params={"month": "2026-10"}, headers=hb).json() == []
            assert client.get(f"/api/transactions/{exp['id']}", headers=hb).status_code == 404
            assert client.patch(f"/api/wallets/{w1['id']}", json={"name": "Hacked"}, headers=hb).status_code == 404
            assert client.delete(f"/api/transactions/{exp['id']}", headers=hb).status_code == 204
            # User A's transaction is still there after User B's delete attempt
            assert client.get(f"/api/transactions/{exp['id']}", headers=ha).status_code == 200
            # User B cannot record a transaction against User A's wallet
            cats_b = client.get("/api/categories", headers=hb).json()
            assert client.post("/api/transactions", headers=hb, json={
                "kind": "expense", "amount": 50, "title": "Sneak", "date": "2026-10-15",
                "walletId": w1["id"], "categoryId": cats_b[0]["id"], "note": "", "source": "manual",
            }).status_code == 422

            # Delete transaction removes its photo from Storage
            with patch.object(storage, "remove", side_effect=lambda _u, path: stored.pop(path, None)):
                assert client.delete(f"/api/transactions/{exp['id']}", headers=ha).status_code == 204
                assert expected_path not in stored
            assert client.delete(f"/api/transactions/{inc['id']}", headers=ha).status_code == 204
            assert client.delete(f"/api/transactions/{xfr['id']}", headers=ha).status_code == 204
    finally:
        with connect() as conn:
            conn.execute("delete from auth.users where id in (%s, %s)", (user_a, user_b))


def test_live_supabase_end_to_end():
    """Full live flow against Supabase Auth (JWKS), Postgres (port 6543 pooler), and Storage (`receipts` bucket)."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    if not (url and anon and os.environ.get("DATABASE_URL")):
        print("Skipping live Supabase Auth + Storage E2E test (set SUPABASE_URL, SUPABASE_ANON_KEY, DATABASE_URL)")
        return

    uid = str(uuid.uuid4())
    email = f"e2e-{uid[:8]}@example.com"
    password = "TestPassword123!"
    with connect() as conn:
        conn.execute(
            """
            insert into auth.users (
              instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
              confirmation_token, email_change, email_change_token_new, recovery_token
            ) values (
              '00000000-0000-0000-0000-000000000000', %s, 'authenticated', 'authenticated', %s,
              crypt(%s, gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Andrea E2E"}'::jsonb, now(), now(),
              '', '', '', ''
            )
            """,
            (uid, email, password),
        )
        conn.execute(
            """
            insert into auth.identities (
              id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            ) values (
              gen_random_uuid(), %s, %s, jsonb_build_object('sub', %s::text, 'email', %s::text), 'email', now(), now(), now()
            )
            """,
            (uid, uid, uid, email),
        )

    try:
        # 1. Sign in via real Supabase Auth and verify the returned JWT via JWKS
        res = httpx.post(
            f"{url}/auth/v1/token?grant_type=password",
            headers={"apikey": anon},
            json={"email": email, "password": password},
            timeout=15,
        )
        assert res.status_code == 200, res.text
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        client = TestClient(app)

        # 2. Seeded categories + add a wallet
        cats = client.get("/api/categories", headers=headers).json()
        assert len(cats) == 11
        groc_id = next(c["id"] for c in cats if c["name"] == "Groceries")
        wallet = client.post("/api/wallets", headers=headers, json={"name": "GCash", "type": "e_wallet", "balance": 3000}).json()
        assert wallet["balance"] == 3000

        # 3. Scan a receipt (with the signed-in user's UUID categories) & save receipt transaction + upload photo to Storage
        fake_model_reply = {
            "merchant": "SM Supermarket", "date": "2026-10-20", "total": 209.2, "category": "Groceries",
            "paymentMethod": "e_wallet", "paymentLabel": "GCash",
            "items": [{"name": "Cheese Buns", "qty": 1, "price": 57.25}, {"name": "Butter Cream", "qty": 2, "price": 75.975}],
        }
        with patch("receipts._ask_model", return_value=fake_model_reply):
            scanned = client.post(
                "/api/receipts/scan", headers=headers, files={"image": ("receipt.webp", TINY_WEBP, "image/webp")}
            ).json()
        assert scanned["suggestedCategoryId"] == groc_id and scanned["total"] == 209.2

        txn = client.post("/api/transactions", headers=headers, json={
            "kind": "expense", "amount": scanned["total"], "title": scanned["merchant"], "date": scanned["date"],
            "walletId": wallet["id"], "categoryId": scanned["suggestedCategoryId"], "note": "Weekly groceries",
            "source": "receipt", "items": scanned["items"],
        }).json()
        txn_id = txn["id"]

        up = client.post(
            f"/api/transactions/{txn_id}/receipt", headers=headers, files={"image": ("receipt.webp", TINY_WEBP, "image/webp")}
        )
        assert up.status_code == 204, up.text

        # 4. Transaction detail returns a working 10-min signed URL from the private `receipts` bucket
        detail = client.get(f"/api/transactions/{txn_id}", headers=headers).json()
        assert detail.get("receiptUrl"), f"expected signed receiptUrl, got {detail}"
        dl = httpx.get(detail["receiptUrl"], timeout=15)
        assert dl.status_code == 200 and dl.content == TINY_WEBP

        # 5. Monthly report and budgets
        assert client.post("/api/budgets", headers=headers, json={"categoryId": None, "limit": 15000, "warnAt": 80}).status_code == 204
        assert client.post("/api/budgets", headers=headers, json={"categoryId": groc_id, "limit": 4000, "warnAt": 80}).status_code == 204
        budgets = client.get("/api/budgets", params={"month": "2026-10"}, headers=headers).json()
        assert len(budgets) == 2 and budgets[0]["spent"] == 209.2 and budgets[1]["spent"] == 209.2
        summary = client.get("/api/reports/summary", params={"month": "2026-10"}, headers=headers).json()
        monthly = client.get("/api/reports/monthly", params={"month": "2026-10"}, headers=headers).json()
        assert summary["spent"] == 209.2 and summary["budget"] == 15000
        assert monthly["byCategory"] == [{"categoryId": groc_id, "total": 209.2}]

        # 6. Export CSV
        csv_res = client.get("/api/transactions/export.csv", params={"month": "2026-10"}, headers=headers)
        assert csv_res.status_code == 200 and "SM Supermarket" in csv_res.text and "209.20" in csv_res.text

        # 7. Delete transaction & confirm the photo is gone from Supabase Storage
        assert client.delete(f"/api/transactions/{txn_id}", headers=headers).status_code == 204
        with connect() as conn:
            remaining = conn.execute(
                "select count(*) as n from storage.objects where bucket_id = 'receipts' and name = %s",
                (f"{uid}/{txn_id}.webp",),
            ).fetchone()["n"]
        assert remaining == 0, f"expected receipt photo deleted from storage.objects, found {remaining}"
    finally:
        with connect() as conn:
            conn.execute("delete from auth.users where id = %s", (uid,))


if __name__ == "__main__":
    test_receipt_normalization()
    test_auth_jwt_verification()
    test_routes_and_user_isolation()
    test_live_supabase_end_to_end()
    print("All backend checks passed")
