"""Postgres access through the Supabase transaction pooler (port 6543).

Reuses connections across requests via a connection pool so warm instances
avoid paying TCP+TLS handshake penalties on every query.

Every request runs inside one transaction as the `authenticated` role with the caller's JWT claims set, the
same way PostgREST does it. RLS (user_id = auth.uid()) therefore applies to the API too, on top of the
explicit `user_id = %(uid)s` in every query.
"""

import atexit
import json
import os
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from auth import AuthUser


# shortcut: pool size 5 fits Vercel function concurrency and Supabase free-tier limits, scale if needed
@lru_cache(maxsize=1)
def get_pool() -> ConnectionPool:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise HTTPException(500, "The server is missing DATABASE_URL.")
    pool = ConnectionPool(
        conninfo=url,
        min_size=1,
        max_size=5,
        check=ConnectionPool.check_connection,
        kwargs={"row_factory": dict_row, "prepare_threshold": None, "connect_timeout": 10},
        open=True,
    )
    atexit.register(pool.close)
    return pool


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    """One pooled connection for non-user background tasks and test fixtures."""
    with get_pool().connection() as conn:
        yield conn


@contextmanager
def user_tx(user: AuthUser) -> Iterator[psycopg.Connection]:
    """One transaction scoped to `user`. Commits when the block ends, rolls back if it raises."""
    with get_pool().connection() as conn:
        conn.execute(
            "select set_config('role', 'authenticated', true), set_config('request.jwt.claims', %s, true)",
            (json.dumps(user.claims),),
        )
        yield conn
