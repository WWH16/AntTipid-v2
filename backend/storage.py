"""Receipt photos in the private Supabase Storage bucket `receipts`, at {user_id}/{transaction_id}.{ext}.

Calls go to the Storage REST API with the caller's own access token, so the bucket's policies (own folder only)
apply and the server needs no service-role key.
"""

import logging
import os

import httpx
from fastapi import HTTPException

from auth import AuthUser

log = logging.getLogger("storage")

BUCKET = "receipts"
MAX_BYTES = 1024 * 1024
SIGNED_URL_SECONDS = 600
# Magic bytes -> (content type, file extension). Checked on the bytes, not the client's Content-Type.
SIGNATURES = [
    (lambda b: b[:3] == b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (lambda b: b[:8] == b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP", "image/webp", "webp"),
]


def sniff_image(data: bytes) -> tuple[str, str] | None:
    """(content type, extension) if the bytes are a JPEG, PNG or WebP image, else None."""
    return next(((ct, ext) for match, ct, ext in SIGNATURES if match(data)), None)


def _base() -> str:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not url or not os.environ.get("SUPABASE_ANON_KEY"):
        raise HTTPException(500, "The server is missing SUPABASE_URL or SUPABASE_ANON_KEY.")
    return f"{url}/storage/v1"


def _headers(user: AuthUser) -> dict:
    return {"Authorization": f"Bearer {user.token}", "apikey": os.environ["SUPABASE_ANON_KEY"]}


def _check(res: httpx.Response, action: str) -> None:
    if res.is_error:
        log.error("storage %s failed: HTTP %s %s", action, res.status_code, res.text[:300])
        raise HTTPException(502, "Couldn't reach photo storage. Try again in a minute.")


def upload(user: AuthUser, path: str, data: bytes, content_type: str) -> None:
    res = httpx.post(
        f"{_base()}/object/{BUCKET}/{path}",
        headers={**_headers(user), "Content-Type": content_type, "x-upsert": "true", "cache-control": "3600"},
        content=data,
        timeout=30,
    )
    _check(res, "upload")


def remove(user: AuthUser, path: str) -> None:
    """Delete one object. A missing object is not an error, so a retry after a partial failure is safe."""
    res = httpx.request("DELETE", f"{_base()}/object/{BUCKET}", headers=_headers(user), json={"prefixes": [path]}, timeout=15)
    _check(res, "delete")


def signed_url(user: AuthUser, path: str) -> str | None:
    """Short-lived link to one photo, or None if Storage can't sign it right now (the detail still opens)."""
    try:
        res = httpx.post(
            f"{_base()}/object/sign/{BUCKET}/{path}", headers=_headers(user), json={"expiresIn": SIGNED_URL_SECONDS}, timeout=10
        )
        _check(res, "sign")
    except (httpx.HTTPError, HTTPException) as e:
        log.warning("could not sign %s: %r", path, e)
        return None
    signed = res.json().get("signedURL")
    return f"{_base()}{signed}" if signed else None
