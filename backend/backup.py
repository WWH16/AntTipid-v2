"""Back up one user's records to a JSON file and restore them from one."""

import logging
import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Response

import months
import storage
from auth import AuthUser, User
from db import user_tx
from models import BackupFile

router = APIRouter()
log = logging.getLogger("backup")

# ponytail: Vercel caps a request and a response at 4.5 MB, roughly 12,000 transactions. Stream or gzip if anyone gets there.


def own_receipt(path: str | None, user_id: str) -> str | None:
    """The photo path if it is one of this user's own, else None: a file from another account must not point at their photos."""
    return path if path and re.fullmatch(rf"{re.escape(user_id)}/[0-9a-fA-F-]{{36}}\.(webp|jpg|png)", path) else None


def leftover_photos(user_id: str, files: list[dict], kept: set[str], started: datetime) -> list[str]:
    """Photos in the user's folder that no transaction uses. One saved since the restore began is kept: its save may not
    have committed yet. Folder markers have no id."""
    paths = (f"{user_id}/{f['name']}" for f in files if f.get("id") and datetime.fromisoformat(f["updated_at"]) < started)
    return [p for p in paths if p not in kept]


def clear_leftover_photos(user: AuthUser, started: datetime) -> None:
    """After a restore, delete photos of transactions that aren't in the file. Photos aren't in backups, so restoring a newer
    file later brings those transactions back without them. A failure only leaves them in storage, so it's logged."""
    try:
        files = storage.list_folder(user)  # before reading what's kept, so a photo saved in between is never listed unkept
        with user_tx(user) as conn:
            kept = {r["receipt_path"] for r in conn.execute(
                "select receipt_path from transactions where user_id = %s and receipt_path is not null", (user.id,))}
        if doomed := leftover_photos(user.id, files, kept, started):
            storage.remove(user, *doomed)
    except Exception:
        log.exception("couldn't clear leftover photos after a restore")


@router.get("/backup")
def export_backup(user: User):
    with user_tx(user) as conn:
        rows = lambda sql: conn.execute(sql, (user.id,)).fetchall()  # noqa: E731
        wallets = rows("select id, name, type, opening_balance, archived, created_at from wallets where user_id = %s order by created_at, id")
        categories = rows("select id, name, kind, icon, once_a_month, created_at from categories where user_id = %s order by created_at, id")
        txns = rows(
            "select id, kind, amount, title, date, wallet_id, to_wallet_id, category_id, note, source, receipt_path, created_at"
            " from transactions where user_id = %s order by created_at, id"
        )
        items = rows("select transaction_id, name, qty, price from receipt_items where user_id = %s order by transaction_id, position")
        checks = rows(
            "select transaction_id, unusual, decision, method, usual_low, usual_high, checked_at from anomaly_checks where user_id = %s"
        )
        budgets = rows('select category_id, limit_amount as "limit", warn_at, created_at from budgets where user_id = %s order by created_at, id')
        history = rows('select category_id, month, limit_amount as "limit" from budget_history where user_id = %s order by month, category_id')
    by_txn: dict = {}
    for i in items:
        by_txn.setdefault(i["transaction_id"], []).append(i)
    checked = {c["transaction_id"]: c for c in checks}
    file = BackupFile.model_validate({
        "app": "anttipid", "version": 1, "exported_on": months.today(),
        "wallets": wallets, "categories": categories, "budgets": budgets, "budget_history": history,
        "transactions": [{**t, "items": by_txn.get(t["id"], []), "anomaly": checked.get(t["id"])} for t in txns],
    })
    return Response(
        file.model_dump_json(by_alias=True),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="anttipid-backup-{months.today()}.json"'},
    )


@router.post("/backup/restore", status_code=204)
def restore_backup(body: BackupFile, user: User):
    started = datetime.now(timezone.utc)
    # One transaction: any failure, including one in the last insert, undoes every step.
    with user_tx(user) as conn:
        conn.execute("select set_config('anttipid.restoring', 'on', true)")  # the audit triggers stay quiet
        for table in ("transactions", "budgets", "categories", "wallets"):
            conn.execute(f"delete from {table} where user_id = %s", (user.id,))
        # New ids, so a file from another account can't collide with rows this user can't see.
        wallet_ids = {w.id: uuid4() for w in body.wallets}
        category_ids = {c.id: uuid4() for c in body.categories}
        txn_ids = [uuid4() for _ in body.transactions]
        mapped = lambda ids, old: ids[old] if old else None  # noqa: E731
        with conn.cursor() as cur:
            cur.executemany(
                "insert into wallets (id, user_id, name, type, opening_balance, archived, created_at) values (%s, %s, %s, %s, %s, %s, %s)",
                [(wallet_ids[w.id], user.id, w.name, w.type, w.opening_balance, w.archived, w.created_at) for w in body.wallets],
            )
            cur.executemany(
                "insert into categories (id, user_id, name, kind, icon, once_a_month, created_at) values (%s, %s, %s, %s, %s, %s, %s)",
                [(category_ids[c.id], user.id, c.name, c.kind, c.icon, c.once_a_month, c.created_at) for c in body.categories],
            )
            cur.executemany(
                "insert into transactions (id, user_id, kind, amount, title, date, wallet_id, to_wallet_id, category_id, note, source,"
                " receipt_path, created_at) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                [
                    (
                        txn_ids[n], user.id, t.kind, t.amount, t.title, t.date, wallet_ids[t.wallet_id],
                        mapped(wallet_ids, t.to_wallet_id), mapped(category_ids, t.category_id), t.note, t.source,
                        own_receipt(t.receipt_path, str(user.id)), t.created_at,
                    )
                    for n, t in enumerate(body.transactions)
                ],
            )
            cur.executemany(
                "insert into receipt_items (user_id, transaction_id, position, name, qty, price) values (%s, %s, %s, %s, %s, %s)",
                [(user.id, txn_ids[n], p, i.name, i.qty, i.price) for n, t in enumerate(body.transactions) for p, i in enumerate(t.items)],
            )
            cur.executemany(
                "insert into anomaly_checks (transaction_id, user_id, unusual, decision, method, usual_low, usual_high, checked_at)"
                " values (%s, %s, %s, %s, %s, %s, %s, %s)",
                [
                    (txn_ids[n], user.id, a.unusual, a.decision, a.method, a.usual_low, a.usual_high, a.checked_at)
                    for n, t in enumerate(body.transactions) if (a := t.anomaly)
                ],
            )
            cur.executemany(
                "insert into budgets (user_id, category_id, limit_amount, warn_at, created_at) values (%s, %s, %s, %s, %s)",
                [(user.id, mapped(category_ids, b.category_id), b.limit, b.warn_at, b.created_at) for b in body.budgets],
            )
        # Back to the connection's owner role until the transaction ends: `authenticated` can't write budget_history or
        # audit_log. Every statement from here names user_id itself.
        conn.execute("select set_config('role', 'none', true)")
        conn.execute("delete from budget_history where user_id = %s", (user.id,))  # the budget inserts wrote today's rows
        with conn.cursor() as cur:
            cur.executemany(
                "insert into budget_history (user_id, category_id, month, limit_amount) values (%s, %s, %s, %s)",
                [(user.id, mapped(category_ids, h.category_id), h.month, h.limit) for h in body.budget_history],
            )
        conn.execute(
            "insert into audit_log (user_id, action, entity, label) values (%s, 'restore', 'account', %s)",
            (user.id, f"{len(body.transactions)} transaction{'' if len(body.transactions) == 1 else 's'}"),
        )
    clear_leftover_photos(user, started)  # only once the restore has committed
