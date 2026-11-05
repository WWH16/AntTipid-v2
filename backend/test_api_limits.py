"""CORS and the receipt scan limit. The limit check needs a database and writes to it, through throwaway users.

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
from receipts import ReceiptScan
from test_audit_backup import direct, needs_db, users


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

        # Users can't reset their own count through Supabase's REST API.
        for sql in ("select * from scan_usage", "update scan_usage set used = 0", "delete from scan_usage"):
            with pytest.raises(errors.InsufficientPrivilege), user_tx(direct(ids[0])) as conn:
                conn.execute(sql)


if __name__ == "__main__":
    for name, test in list(globals().items()):
        if name.startswith("test_"):
            test()
    print("All API limit checks passed")
