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

    # Misread dates (impossible or future) fall back to today; long item names are cut to what saving allows
    for day in ("2026-02-30", "2999-01-01"):
        assert normalize_scan({"total": 10, "date": day}).date == date.today().isoformat()
    assert len(normalize_scan({"total": 10, "items": [{"name": "x" * 300, "price": 10}]}).items[0].name) == 200

    # Unit prices keep 2 decimals, as saved; discount lines and misread negative quantities are dropped
    rounded = normalize_scan({"total": 401.94, "items": [
        {"name": "Butter Cream", "qty": 2, "price": 75.975}, {"name": "Chicken", "qty": 1, "price": 250},
        {"name": "Senior discount", "qty": 1, "price": -50}, {"name": "Misread", "qty": -1, "price": 10},
    ]})
    assert [(i.name, i.price) for i in rounded.items] == [("Butter Cream", 75.97), ("Chicken", 250)]
    assert rounded.low_confidence is False

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


def test_transaction_patch_keeps_items_typed():
    # Editing a receipt's items used to crash: model_dump turned them into dicts with no .name.
    from ledger import merge_patch
    from models import TransactionIn, TransactionPatch

    current = TransactionIn.model_validate({
        "kind": "expense", "amount": 100, "title": "Lunch", "date": "2026-10-20",
        "walletId": str(uuid.uuid4()), "categoryId": str(uuid.uuid4()),
        "items": [{"name": "Rice", "qty": 1, "price": 100}],
    })
    merged = merge_patch(current, TransactionPatch.model_validate({"items": [{"name": " Adobo ", "qty": 2, "price": 50}]}))
    assert [(i.name, i.qty, i.price) for i in merged.items] == [("Adobo", 2, 50)]
    assert (merged.title, merged.amount) == ("Lunch", 100)


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

            # 2. Wallets: create, list with computed balance, update, delete (unused only)
            w1 = client.post("/api/wallets", json={"name": "GCash", "type": "e_wallet", "balance": 1000}, headers=ha).json()
            w2 = client.post("/api/wallets", json={"name": "Cash", "type": "cash", "balance": 500}, headers=ha).json()
            assert w1["balance"] == 1000 and w2["balance"] == 500
            assert client.patch(f"/api/wallets/{w2['id']}", json={"name": "Pocket Cash"}, headers=ha).json()["name"] == "Pocket Cash"
            spare = client.post("/api/wallets", json={"name": "Typo", "type": "bank", "balance": 0}, headers=ha).json()
            assert client.delete(f"/api/wallets/{spare['id']}", headers=ha).status_code == 204
            assert spare["id"] not in [w["id"] for w in client.get("/api/wallets", headers=ha).json()]

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
            # since is inclusive: the 10-15 expense and 10-16 transfer, not the 10-01 income
            since = client.get("/api/transactions", params={"since": "2026-10-15"}, headers=ha).json()
            assert {t["id"] for t in since} == {exp["id"], xfr["id"]}
            assert client.get("/api/transactions", params={"since": "not-a-date"}, headers=ha).status_code == 422
            assert client.delete(f"/api/categories/{food_id}", headers=ha).status_code == 409
            assert client.delete(f"/api/wallets/{w1['id']}", headers=ha).status_code == 409

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
            # Category budgets share the month: together they can't add up to more than it, from either side.
            # Food's own 2,000 doesn't count against its new limit, so it can grow to the whole 10,000.
            assert client.post("/api/budgets", json={"categoryId": food_id, "limit": 10001, "warnAt": 75}, headers=ha).status_code == 422
            groc_a = next(c["id"] for c in cats_a if c["name"] == "Groceries")
            too_many = client.post("/api/budgets", json={"categoryId": groc_a, "limit": 8001, "warnAt": 80}, headers=ha)
            assert too_many.status_code == 422 and "₱8,000" in too_many.json()["detail"]
            too_low = client.post("/api/budgets", json={"categoryId": None, "limit": 1999, "warnAt": 80}, headers=ha)
            assert too_low.status_code == 422 and "can't be less" in too_low.json()["detail"]
            b_list = client.get("/api/budgets", params={"month": "2026-10"}, headers=ha).json()
            assert len(b_list) == 2 and b_list[0]["categoryId"] is None and b_list[0]["spent"] == 250
            assert b_list[1]["categoryId"] == food_id and b_list[1]["spent"] == 250

            rep_sum = client.get("/api/reports/summary", params={"month": "2026-10"}, headers=ha).json()
            assert rep_sum["income"] == 5000 and rep_sum["spent"] == 250 and rep_sum["budget"] == 10000
            assert rep_sum["fixed"] == []  # no category is paid once a month yet
            # Paid once a month: Food switched on shows its spending in the summary; income categories can't be.
            assert client.patch(f"/api/categories/{food_id}", json={"onceAMonth": True}, headers=ha).json()["onceAMonth"] is True
            assert client.patch(f"/api/categories/{salary_id}", json={"onceAMonth": True}, headers=ha).status_code == 422
            fixed = client.get("/api/reports/summary", params={"month": "2026-10"}, headers=ha).json()["fixed"]
            assert fixed == [{"categoryId": food_id, "total": 250}]
            assert client.patch(f"/api/categories/{food_id}", json={"onceAMonth": False}, headers=ha).json()["onceAMonth"] is False
            rep_mon = client.get("/api/reports/monthly", params={"month": "2026-10"}, headers=ha).json()
            assert rep_mon["byCategory"] == [{"categoryId": food_id, "total": 250}]
            assert sorted(rep_mon["budgets"], key=lambda b: b["categoryId"] or "") == [
                {"categoryId": None, "limit": 10000}, {"categoryId": food_id, "limit": 2000},
            ]
            # Budget history: a past month reads the budgets it had, not today's. August had a 6,000 monthly budget
            # and no Food one; September has no row of its own, so it keeps August's.
            with connect() as conn:
                conn.execute(
                    "insert into budget_history (user_id, category_id, month, limit_amount) values (%s, null, '2026-08-01', 6000)",
                    (user_a,),
                )
            for m in ("2026-08", "2026-09"):
                assert client.get("/api/reports/monthly", params={"month": m}, headers=ha).json()["budgets"] == [{"categoryId": None, "limit": 6000}]
                assert client.get("/api/reports/summary", params={"month": m}, headers=ha).json()["budget"] == 6000
            # A budget removed this month is gone from this month on.
            food_budget = next(b for b in b_list if b["categoryId"] == food_id)
            assert client.delete(f"/api/budgets/{food_budget['id']}", headers=ha).status_code == 204
            assert client.get("/api/reports/monthly", params={"month": "2026-10"}, headers=ha).json()["budgets"] == [{"categoryId": None, "limit": 10000}]
            # Deleting an unused category with a budget takes its budget and its history with it.
            gone = client.post("/api/categories", json={"name": "Hobbies", "kind": "expense", "icon": "other"}, headers=ha).json()
            assert client.post("/api/budgets", json={"categoryId": gone["id"], "limit": 500, "warnAt": 80}, headers=ha).status_code == 204
            assert client.delete(f"/api/categories/{gone['id']}", headers=ha).status_code == 204
            with connect() as conn:
                assert conn.execute("select count(*) as n from budget_history where category_id = %s", (gone["id"],)).fetchone()["n"] == 0
            assert len(rep_mon["trend"]) == 6 and rep_mon["trend"][-1] == {"month": "2026-10", "income": 5000, "spent": 250}
            # Month picker: only months with transactions, oldest first; spent counts expenses only
            rep_months = client.get("/api/reports/months", headers=ha).json()
            assert rep_months == {"budget": 10000, "months": [{"month": "2026-10", "spent": 250}]}

            # 6. User isolation: User B cannot see or touch any of User A's rows
            assert client.get("/api/wallets", headers=hb).json() == []
            assert client.get("/api/transactions", headers=hb).json() == []
            assert client.get("/api/reports/months", headers=hb).json() == {"budget": 0, "months": []}
            assert client.get("/api/budgets", params={"month": "2026-10"}, headers=hb).json() == []
            assert client.get(f"/api/transactions/{exp['id']}", headers=hb).status_code == 404
            assert client.patch(f"/api/wallets/{w1['id']}", json={"name": "Hacked"}, headers=hb).status_code == 404
            assert client.delete(f"/api/wallets/{w2['id']}", headers=hb).status_code == 204
            assert w2["id"] in [w["id"] for w in client.get("/api/wallets", headers=ha).json()]
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


def test_anomalies_route():
    """Feature 9 over the API: verdicts frozen at save, judged on the history before each purchase; the user decides
    one-off or normal, and only "normal" teaches the habits."""
    if not os.environ.get("DATABASE_URL"):
        print("Skipping live DB anomaly test (set DATABASE_URL in backend/.env to run it)")
        return
    user_a, user_b = str(uuid.uuid4()), str(uuid.uuid4())
    with connect() as conn:
        conn.execute(
            "insert into auth.users (id, email, aud, role, created_at, updated_at) values "
            "(%s, %s, 'authenticated', 'authenticated', now(), now()), (%s, %s, 'authenticated', 'authenticated', now(), now())",
            (user_a, f"a-{user_a[:8]}@example.com", user_b, f"b-{user_b[:8]}@example.com"),
        )
    try:
        with patch.dict(os.environ, {"SUPABASE_URL": TEST_URL, "SUPABASE_JWT_SECRET": TEST_SECRET}):
            client = TestClient(app)
            ha = {"Authorization": f"Bearer {_make_token(user_a)}"}
            hb = {"Authorization": f"Bearer {_make_token(user_b)}"}
            cats = {c["name"]: c["id"] for c in client.get("/api/categories", headers=ha).json()}
            food, bills = cats["Food & dining"], cats["Bills & utilities"]
            w = client.post("/api/wallets", json={"name": "Cash", "type": "cash", "balance": 0}, headers=ha).json()["id"]

            def spend(amount, day, cat=food, decision=None):
                return client.post("/api/transactions", headers=ha, json={
                    "kind": "expense", "amount": amount, "title": "x", "date": day,
                    "walletId": w, "categoryId": cat, "note": "", "source": "manual", "anomalyDecision": decision,
                }).json()["id"]

            def flagged(month="2026-10"):
                return {a["transactionId"]: a for a in client.get("/api/anomalies", params={"month": month}, headers=ha).json()}

            def decide(txn, decision, also_earlier=False, headers=ha):
                return client.put(f"/api/anomalies/{txn}/decision", headers=headers, json={"decision": decision, "alsoEarlier": also_earlier})

            check = lambda amount, day="2026-10-25", **extra: client.get("/api/anomalies/check", headers=ha, params={  # noqa: E731
                "categoryId": food, "amount": amount, "date": day, **extra}).json()

            # August to October: snacks and meals. The first meals come after only snacks, so they're flagged at save
            # (a habit nobody has taught yet); the user calls them normal, as the add form asks, and they teach the habit.
            for i, amount in enumerate([85, 95, 100, 105, 110, 115, 120, 380, 400, 420, 450]):
                spend(amount, f"2026-{8 + i % 3:02d}-{10 + i:02d}", decision="normal")
            # October adds a ₱4,500 dinner, saved without a decision: waiting for review.
            dinner = spend(4500, "2026-10-20")
            spend(130, "2026-10-21")
            assert list(flagged().values()) == [{
                "transactionId": dinner, "categoryId": food, "amount": 4500, "decision": None,
                "method": "kmeans", "usualLow": 85, "usualHigh": 450,
            }]
            # The loophole: a second big one is judged on the history before it, which leaves the first out (not a
            # habit), so both stay flagged.
            dinner2 = spend(4400, "2026-10-22")
            assert set(flagged()) == {dinner, dinner2}
            assert flagged("2026-09") == {}

            # Before saving: unusual, no one-off like it yet, and a same-day same-amount entry is a likely duplicate.
            first = check(4500, exclude=dinner)
            assert first["unusual"] is True and first["usualLow"] == 85 and first["usualHigh"] == 450 and first["similar"] == []
            assert check(130)["unusual"] is False and check(130)["duplicate"] is False
            assert check(4400, day="2026-10-22")["duplicate"] is True

            # The user decides: one-off. Only the owner can.
            assert decide(dinner, "one_off", headers=hb).status_code == 404
            assert decide(dinner, "one_off").json() == []
            assert flagged()[dinner]["decision"] == "one_off"
            assert check(4500)["similar"] == [{"transactionId": dinner, "date": "2026-10-20", "amount": 4500}]
            # Deciding in the add form, at save.
            dinner3 = spend(4600, "2026-10-24", decision="one_off")
            assert flagged()[dinner3]["decision"] == "one_off"

            # "Normal" asks about earlier similar one-offs (the Oct 20 one; Oct 24 is later), and counts them too on yes.
            assert decide(dinner2, "normal").json() == [{"transactionId": dinner, "date": "2026-10-20", "amount": 4500}]
            decide(dinner2, "normal", also_earlier=True)
            assert set(flagged()) == {dinner3}
            # Taught: ₱4,500 dinners are now a habit, so a new one isn't unusual.
            assert check(4550)["unusual"] is False

            # Editing the amount re-checks it; a normal amount clears the flag.
            assert client.patch(f"/api/transactions/{dinner3}", json={"amount": 150}, headers=ha).status_code == 200
            assert flagged() == {}

            # A once-a-month category is left alone: its big payment is expected.
            assert client.patch(f"/api/categories/{food}", json={"onceAMonth": True}, headers=ha).status_code == 200
            spend(9000, "2026-10-25")
            assert flagged() == {} and check(9000)["unusual"] is False
            assert bills
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
    # Password sign-in needs a Turnstile token once CAPTCHA protection is on, but Auth exempts the
    # refresh_token grant, so seed a session + refresh token and exchange it for a real access token.
    refresh = uuid.uuid4().hex[:12]  # Auth only accepts 12-char legacy refresh tokens
    with connect() as conn:
        conn.execute(
            """
            insert into auth.users (
              instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
              confirmation_token, email_change, email_change_token_new, recovery_token
            ) values (
              '00000000-0000-0000-0000-000000000000', %s, 'authenticated', 'authenticated', %s, '', now(),
              '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Andrea E2E"}'::jsonb, now(), now(),
              '', '', '', ''
            )
            """,
            (uid, email),
        )
        conn.execute(
            """
            with s as (
              insert into auth.sessions (id, user_id, created_at, updated_at, aal)
              values (gen_random_uuid(), %(uid)s, now(), now(), 'aal1') returning id
            )
            insert into auth.refresh_tokens (instance_id, token, user_id, revoked, session_id, created_at, updated_at)
            select '00000000-0000-0000-0000-000000000000', %(refresh)s, %(uid)s, false, s.id, now(), now() from s
            """,
            {"uid": uid, "refresh": refresh},
        )

    try:
        # 1. Get a token from real Supabase Auth and verify the returned JWT via JWKS
        res = httpx.post(
            f"{url}/auth/v1/token?grant_type=refresh_token",
            headers={"apikey": anon},
            json={"refresh_token": refresh},
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
