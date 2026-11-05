"""AntTipid API: receipt scanning plus the user's wallets, categories, transactions, budgets and reports.

Data lives in Supabase Postgres (db.py), receipt photos in Supabase Storage (storage.py), and every route needs a
Supabase access token (auth.py). Route groups are in ledger.py, reports.py, audit.py, backup.py and notify_routes.py.
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Explicit path: a bare load_dotenv() searches from the working directory under `uvicorn --reload`
# and misses this file when started from the repo root. On Vercel there is no .env; this is a no-op.
load_dotenv(Path(__file__).with_name(".env"))
logging.basicConfig(level=logging.INFO)

import psycopg  # noqa: E402
from psycopg import errors  # noqa: E402

import audit  # noqa: E402
import backup  # noqa: E402
import ledger  # noqa: E402
import notify_routes  # noqa: E402
import reports  # noqa: E402
from auth import AuthUser, User  # noqa: E402
from db import connect, user_tx  # noqa: E402
from months import today  # noqa: E402
from receipts import NotAReceipt, ReceiptScan, ScanFailed, scan_receipt  # noqa: E402  (needs the env loaded)

MAX_PHOTO_BYTES = 8 * 1024 * 1024
# ponytail: per user, so many accounts together can still use up the shared free quota. Add a global count if that happens.
SCAN_LIMIT_PER_DAY = 30
log = logging.getLogger("api")

app = FastAPI(title="AntTipid API")
app.add_middleware(
    CORSMiddleware,
    # The app itself doesn't rely on this: frontend/vercel.json and vite.config.ts proxy /api, so its browser sees one origin.
    allow_origins=[os.environ.get("APP_URL", "").rstrip("/"), "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
api = APIRouter(prefix="/api")


def _take_scan(user_id: str) -> bool:
    """Count one scan against the caller's day; False once the day is used up. One atomic statement, so the count holds
    across Vercel instances. Uses the server's connection because users have no access to scan_usage: with access they
    could reset their own count through Supabase's REST API."""
    with connect() as conn:
        return conn.execute(
            """
            insert into scan_usage (user_id, day) values (%(uid)s, %(day)s)
            on conflict (user_id) do update
              set used = case when scan_usage.day = excluded.day then scan_usage.used + 1 else 1 end, day = excluded.day
            where scan_usage.day <> excluded.day or scan_usage.used < %(limit)s
            returning used
            """,
            {"uid": user_id, "day": today(), "limit": SCAN_LIMIT_PER_DAY},
        ).fetchone() is not None


def _user_categories(user: AuthUser) -> dict[str, str]:
    """The caller's expense categories (id -> name) for the category suggestion."""
    try:
        with user_tx(user) as conn:
            rows = conn.execute("select id, name from categories where user_id = %s and kind = 'expense'", (user.id,))
            return {str(r["id"]): r["name"] for r in rows}
    except (psycopg.Error, HTTPException) as e:
        log.warning("scan: couldn't load categories, scanning without a suggestion: %r", e)
        return {}


@api.post("/receipts/scan", response_model=ReceiptScan)
async def scan(image: UploadFile, user: User) -> ReceiptScan:
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Upload a JPEG, PNG or WebP photo.")
    data = await image.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "That photo is too big. Try one under 8 MB.")
    if not await run_in_threadpool(_take_scan, user.id):
        raise HTTPException(429, f"You've used today's {SCAN_LIMIT_PER_DAY} receipt scans. Try again tomorrow, or type it in.")
    try:
        return await scan_receipt(data, image.content_type, await run_in_threadpool(_user_categories, user))
    except NotAReceipt:
        raise HTTPException(422, "Couldn't find a total on this photo. Try a sharper photo with the total visible.")
    except ScanFailed as e:
        logging.error("scan failed: %s", e)  # e.g. a missing API key, or every model down
        raise HTTPException(502, "Receipt reading is busy right now. Try again in a minute, or type it in.")


api.include_router(ledger.router)
api.include_router(reports.router)
api.include_router(audit.router)
api.include_router(backup.router)
api.include_router(notify_routes.router)
app.include_router(api)


# Database errors the routes don't handle themselves, as readable {"detail": ...} bodies for the client.
@app.exception_handler(errors.ForeignKeyViolation)
async def _fk(_: Request, e: Exception):
    return JSONResponse({"detail": "That wallet or category no longer exists. Reload and try again."}, 422)


@app.exception_handler(errors.CheckViolation)
async def _check(_: Request, e: Exception):
    log.info("check violation: %s", e)
    return JSONResponse({"detail": "Some of those values aren't allowed. Check the form and try again."}, 422)


@app.exception_handler(errors.UniqueViolation)
async def _unique(_: Request, e: Exception):
    return JSONResponse({"detail": "That already exists."}, 409)


@app.exception_handler(psycopg.OperationalError)
async def _down(_: Request, e: Exception):
    log.error("database unavailable: %s", e)
    return JSONResponse({"detail": "Can't reach the database right now. Try again in a minute."}, 503)
