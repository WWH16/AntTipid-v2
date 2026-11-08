"""CORS, the receipt scan limit, and the limits on what a request can save. The database checks write to it, through
throwaway users.

Run with: .venv/Scripts/python test_api_limits.py
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from psycopg import errors

import main
from db import user_tx
from months import today
from receipts import NotAReceipt, ReceiptScan, ScanFailed
from test_audit_backup import direct, food_id, needs_db, users, wallet


def preflight(origin):
    return TestClient(main.app).options("/api/wallets", headers={
        "Origin": origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization",
    })


def test_preflight_refuses_other_origins():
    allowed = preflight("http://localhost:5173")
    assert allowed.status_code == 200 and allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    refused = preflight("https://evil.example")
    assert refused.status_code == 400 and "access-control-allow-origin" not in refused.headers


@needs_db
def test_scan_limit():
    reply = ReceiptScan(merchant="SM", date="2026-11-05", total=100, items=[])
    with users(3) as (client, ids, (h1, h2, _)), patch("main.SCAN_LIMIT_PER_DAY", 2), \
            patch("main.scan_receipt", AsyncMock(return_value=reply)) as read:
        def scan(h, content_type="image/webp"):
            return client.post("/api/receipts/scan", headers=h, files={"image": ("receipt", b"photo", content_type)})

        assert scan(h1, "text/plain").status_code == 415  # a refused file doesn't count
        assert scan(h1).status_code == 200
        assert scan(h1).status_code == 200
        refused = scan(h1)
        assert refused.status_code == 429 and refused.json()["detail"] == "You've used today's 2 receipt scans. Try again tomorrow, or type it in."
        assert read.await_count == 2  # a refused scan spends no model quota

        assert scan(h2).status_code == 200  # each user has their own count

        with patch("main.today", return_value=today() + timedelta(days=1)):
            assert scan(h1).status_code == 200  # a new day starts over

        # Parallel scans share one row, as Vercel instances do, so they can't slip past the limit.
        with ThreadPoolExecutor(8) as pool:
            assert sum(pool.map(main._take_scan, [ids[2]] * 8)) == 2

        # A scan no model could read is given back; one a model read (no total found) still counts.
        with patch("main.today", return_value=today() + timedelta(days=2)):
            with patch("main.scan_receipt", AsyncMock(side_effect=ScanFailed("every model down"))):
                assert scan(h1).status_code == 502 and scan(h1).status_code == 502
            with patch("main.scan_receipt", AsyncMock(side_effect=NotAReceipt("no total"))):
                assert scan(h1).status_code == 422
            assert scan(h1).status_code == 200  # 2 allowed: the failed two came back, the unreadable one didn't
            assert scan(h1).status_code == 429

        # Users can't reset their own count through Supabase's REST API.
        for sql in ("select * from scan_usage", "update scan_usage set used = 0", "delete from scan_usage"):
            with pytest.raises(errors.InsufficientPrivilege), user_tx(direct(ids[0])) as conn:
                conn.execute(sql)


@needs_db
def test_bad_values_get_a_readable_422():
    with users() as (client, _, (h,)):
        base = {"kind": "expense", "amount": 100, "title": "x", "date": today().isoformat(),
                "walletId": wallet(client, h, "Cash"), "categoryId": food_id(client, h)}
        txn = client.post("/api/transactions", json=base, headers=h)
        assert txn.status_code == 201

        # Dates: 2000 up to today. A future day took money from a wallet in a month no screen shows; 0026 was a typo.
        for day in ((today() + timedelta(days=1)).isoformat(), "2099-01-01", "1999-12-31", "0026-11-05", "0001-03-01"):
            assert client.post("/api/transactions", json={**base, "date": day}, headers=h).status_code == 422, day
        assert client.post("/api/transactions", json={**base, "date": "2000-01-01"}, headers=h).status_code == 201

        # Months: 2000 to 2099, so month arithmetic can't run past year 1 or 9999.
        for month in ("0000-01", "0001-03", "9999-12", "1999-12"):
            for path in ("/api/reports/summary", "/api/reports/monthly", "/api/budgets", "/api/transactions"):
                assert client.get(path, params={"month": month}, headers=h).status_code == 422, (path, month)

        # An edit with a null for something required.
        for field in ("amount", "title", "date", "walletId", "note", "kind", "source"):
            res = client.patch(f"/api/transactions/{txn.json()['id']}", json={field: None}, headers=h)
            assert res.status_code == 422, field

        # What Postgres refuses after the request checks pass: past numeric(14, 2) once rounded, and NUL characters.
        for body in ({**base, "amount": 999999999999.999}, {**base, "title": "a\u0000b"},
                     {**base, "items": [{"name": "a", "qty": 9999999.9999, "price": 1}]}):
            res = client.post("/api/transactions", json=body, headers=h)
            assert res.status_code == 422 and "aren't allowed" in res.json()["detail"]
        assert client.get("/api/transactions", params={"search": "\u0000"}, headers=h).status_code == 422


if __name__ == "__main__":
    for name, test in list(globals().items()):
        if name.startswith("test_"):
            test()
    print("All API limit checks passed")
