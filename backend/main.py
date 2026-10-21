"""AntTipid API: receipt scanning plus the user's wallets, categories, transactions, budgets and reports.

Data lives in Supabase Postgres (db.py), receipt photos in Supabase Storage (storage.py), and every route except
scanning needs a Supabase access token (auth.py). Route groups are in ledger.py and reports.py.
"""

import logging
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Explicit path: a bare load_dotenv() searches from the working directory under `uvicorn --reload`
# and misses this file when started from the repo root. On Vercel there is no .env; this is a no-op.
load_dotenv(Path(__file__).with_name(".env"))
logging.basicConfig(level=logging.INFO)

import psycopg  # noqa: E402
from psycopg import errors  # noqa: E402

import ledger  # noqa: E402
import reports  # noqa: E402
from auth import AuthUser, User  # noqa: E402
from db import connect, user_tx  # noqa: E402
from receipts import NotAReceipt, ReceiptScan, ScanFailed, scan_receipt  # noqa: E402  (needs the env loaded)

MAX_PHOTO_BYTES = 8 * 1024 * 1024
log = logging.getLogger("api")

app = FastAPI(title="AntTipid API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
api = APIRouter(prefix="/api")

# Rate limit email check to prevent automated enumeration (10 requests per minute per IP)
_check_email_ips: dict[str, list[float]] = {}


def _is_rate_limited(ip: str) -> bool:
    now = time.monotonic()
    times = [t for t in _check_email_ips.get(ip, []) if now - t < 60]
    if len(times) >= 10:
        return True
    times.append(now)
    _check_email_ips[ip] = times
    # Keep eviction: X-Forwarded-For is client-set, so the dict would otherwise grow without bound.
    if len(_check_email_ips) > 1000:
        expired = [k for k, v in _check_email_ips.items() if not v or now - v[-1] >= 60]
        for k in expired:
            _check_email_ips.pop(k, None)
    return False


@api.get("/auth/check-email")
def check_email(request: Request, email: str = Query(..., max_length=255)):
    """Check if an email already exists in auth.users for live sign-up validation."""
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else "127.0.0.1"
    )
    if _is_rate_limited(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again in a minute.")
    clean = email.strip().lower()
    with connect() as conn:
        r = conn.execute(
            "select exists(select 1 from auth.users where lower(email) = %s) as exists", (clean,)
        ).fetchone()
        return {"exists": bool(r["exists"] if r else False)}


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
    try:
        return await scan_receipt(data, image.content_type, await run_in_threadpool(_user_categories, user))
    except NotAReceipt:
        raise HTTPException(422, "Couldn't find a total on this photo. Try a sharper photo with the total visible.")
    except ScanFailed as e:
        logging.error("scan failed: %s", e)  # e.g. a missing API key, or every model down
        raise HTTPException(502, "Receipt reading is busy right now. Try again in a minute, or type it in.")


api.include_router(ledger.router)
api.include_router(reports.router)
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
