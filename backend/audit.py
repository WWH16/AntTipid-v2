"""The audit log: who changed what and when. Rows are written by database triggers (see the audit_log migration)."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query

from auth import User
from db import user_tx
from models import AuditEntry

router = APIRouter()


@router.get("/audit", response_model=list[AuditEntry])
def list_audit(
    user: User,
    limit: Annotated[int, Query(ge=1, le=1000)] = 50,
    entity: Literal["transaction", "wallet", "category", "budget", "account"] | None = None,
):
    with user_tx(user) as conn:
        return conn.execute(
            """
            select id, action, entity, label, changes, created_at from audit_log
            where user_id = %(uid)s and (%(entity)s::text is null or entity = %(entity)s)
            order by id desc limit %(limit)s
            """,
            {"uid": user.id, "entity": entity, "limit": limit},
        ).fetchall()
