"""Postgres access through the Supabase transaction pooler (port 6543).

Vercel functions are short-lived, so each request opens one connection to the pooler and closes it at the end;
the pooler keeps the real Postgres connections. Transaction mode can't use prepared statements, so they are off.

Every request runs inside one transaction as the `authenticated` role with the caller's JWT claims set, the
same way PostgREST does it. RLS (user_id = auth.uid()) therefore applies to the API too, on top of the
explicit `user_id = %(uid)s` in every query.
"""

import json
import os
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row

from auth import AuthUser


def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise HTTPException(500, "The server is missing DATABASE_URL.")
    return psycopg.connect(url, row_factory=dict_row, prepare_threshold=None, connect_timeout=10)


@contextmanager
def user_tx(user: AuthUser) -> Iterator[psycopg.Connection]:
    """One transaction scoped to `user`. Commits when the block ends, rolls back if it raises."""
    with connect() as conn:  # psycopg: commit on clean exit, rollback on exception, then close
        conn.execute(
            "select set_config('role', 'authenticated', true), set_config('request.jwt.claims', %s, true)",
            (json.dumps(user.claims),),
        )
        yield conn
