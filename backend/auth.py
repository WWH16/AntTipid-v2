"""Who is calling: verify the Supabase access token sent as `Authorization: Bearer <jwt>`.

New Supabase projects sign tokens with an asymmetric key (ES256/RS256) published at the project's JWKS URL;
older ones use the shared HS256 JWT secret. Both are accepted, picked by the token's `alg` header.
"""

import logging
import os
from dataclasses import dataclass
from functools import lru_cache

import jwt
from typing import Annotated

from fastapi import Depends, Header, HTTPException

log = logging.getLogger("auth")

ASYMMETRIC = {"ES256", "RS256"}


@dataclass(frozen=True)
class AuthUser:
    id: str
    token: str  # forwarded to Supabase Storage so its policies see the same user
    claims: dict  # handed to Postgres so RLS (auth.uid()) sees the same user


def _supabase_url() -> str:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not url:
        raise HTTPException(500, "The server is missing SUPABASE_URL.")
    return url


@lru_cache(maxsize=1)
def _jwks(url: str) -> jwt.PyJWKClient:
    # Keys are cached in memory for the life of the (warm) function; a rotated key is refetched on a kid miss.
    return jwt.PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600, timeout=10)


def verify_token(token: str) -> dict:
    """Return the token's claims, or raise HTTPException(401). Raises 503 if the key set can't be fetched."""
    url = _supabase_url()
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256":
            secret = os.environ.get("SUPABASE_JWT_SECRET")
            if not secret:
                raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not set")
            key = secret
        elif alg in ASYMMETRIC:
            key = _jwks(url).get_signing_key_from_jwt(token).key
        else:
            raise jwt.InvalidAlgorithmError(f"unexpected alg {alg!r}")
        claims = jwt.decode(
            token, key, algorithms=[alg], audience="authenticated", issuer=f"{url}/auth/v1", leeway=30,
            options={"require": ["sub", "exp", "aud", "iss"]},
        )
    except jwt.PyJWKClientConnectionError as e:
        log.error("could not fetch JWKS: %s", e)
        raise HTTPException(503, "Couldn't check your sign-in right now. Try again in a minute.")
    except jwt.PyJWTError as e:
        log.info("rejected token: %s", e)
        raise HTTPException(401, "Your session has expired. Sign in again.")
    if claims.get("role") != "authenticated":
        raise HTTPException(401, "Your session has expired. Sign in again.")
    return claims


def _bearer(authorization: str | None) -> str | None:
    scheme, _, token = (authorization or "").partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def current_user(authorization: str | None = Header(default=None)) -> AuthUser:
    token = _bearer(authorization)
    if not token:
        raise HTTPException(401, "Sign in to continue.")
    claims = verify_token(token)
    return AuthUser(id=claims["sub"], token=token, claims=claims)


User = Annotated[AuthUser, Depends(current_user)]


def optional_user(authorization: str | None = Header(default=None)) -> AuthUser | None:
    """For routes that also work signed out (receipt scanning in mock mode)."""
    return current_user(authorization) if _bearer(authorization) else None
