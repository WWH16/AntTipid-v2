"""Wallets, categories and transactions. Every query is scoped to the signed-in user (and RLS backs it up)."""

import csv
import io
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile
from psycopg import errors

import storage
from auth import AuthUser, User
from db import user_tx
from models import (
    Category, CategoryIn, CategoryPatch, Month, Transaction, TransactionIn, TransactionKind, TransactionPatch,
    Wallet, WalletIn, WalletPatch,
)
from months import month_range

router = APIRouter()

# ---------------------------------------------------------------------------------------------- wallets

WALLET_NET = """coalesce((
    select sum(case
      when t.kind = 'income' and t.wallet_id = w.id then t.amount
      when t.kind in ('expense', 'transfer') and t.wallet_id = w.id then -t.amount
      when t.kind = 'transfer' and t.to_wallet_id = w.id then t.amount
      else 0 end)
    from transactions t
    where t.user_id = w.user_id and (t.wallet_id = w.id or t.to_wallet_id = w.id)
  ), 0)"""

WALLET_SELECT = f"""
select w.id, w.name, w.type, w.archived,
  w.opening_balance + {WALLET_NET} as balance
from wallets w
where w.user_id = %(uid)s
"""


def _wallet(r: dict) -> Wallet:
    return Wallet(id=str(r["id"]), name=r["name"], type=r["type"], balance=float(r["balance"]), archived=r["archived"])


@router.get("/wallets", response_model=list[Wallet])
def list_wallets(user: User):
    with user_tx(user) as conn:
        return [_wallet(r) for r in conn.execute(WALLET_SELECT + " order by w.created_at, w.id", {"uid": user.id})]


@router.post("/wallets", response_model=Wallet, status_code=201)
def create_wallet(body: WalletIn, user: User):
    with user_tx(user) as conn:
        r = conn.execute(
            "insert into wallets (user_id, name, type, opening_balance) values (%s, %s, %s, %s) returning id",
            (user.id, body.name, body.type, body.balance),
        ).fetchone()
        return _wallet(conn.execute(WALLET_SELECT + " and w.id = %(id)s", {"uid": user.id, "id": r["id"]}).fetchone())


@router.patch("/wallets/{wallet_id}", response_model=Wallet)
def update_wallet(wallet_id: UUID, body: WalletPatch, user: User):
    patch = body.model_dump(exclude_unset=True, exclude_none=True)
    with user_tx(user) as conn:
        if patch:
            sets = [
                f"opening_balance = %(balance)s - {WALLET_NET}" if col == "balance" else f"{col} = %({col})s"
                for col in patch
            ]  # columns come from the model, not the client
            conn.execute(
                f"update wallets w set {', '.join(sets)} where w.id = %(id)s and w.user_id = %(uid)s",
                {**patch, "id": wallet_id, "uid": user.id},
            )
        r = conn.execute(WALLET_SELECT + " and w.id = %(id)s", {"uid": user.id, "id": wallet_id}).fetchone()
        if not r:
            raise HTTPException(404, "Wallet not found")
        return _wallet(r)


@router.delete("/wallets/{wallet_id}", status_code=204)
def delete_wallet(wallet_id: UUID, user: User):
    try:
        with user_tx(user) as conn:
            conn.execute("delete from wallets where id = %s and user_id = %s", (wallet_id, user.id))
    except errors.ForeignKeyViolation:
        raise HTTPException(409, "This wallet has transactions. Archive it instead to hide it and keep its history.")


# ------------------------------------------------------------------------------------------- categories


def _category(r: dict) -> Category:
    return Category(id=str(r["id"]), name=r["name"], kind=r["kind"], icon=r["icon"])


@router.get("/categories", response_model=list[Category])
def list_categories(user: User):
    with user_tx(user) as conn:
        rows = conn.execute(
            "select id, name, kind, icon from categories where user_id = %s order by created_at, name", (user.id,)
        )
        return [_category(r) for r in rows]


@router.post("/categories", response_model=Category, status_code=201)
def create_category(body: CategoryIn, user: User):
    with user_tx(user) as conn:
        r = conn.execute(
            "insert into categories (user_id, name, kind, icon) values (%s, %s, %s, %s) returning id, name, kind, icon",
            (user.id, body.name, body.kind, body.icon),
        ).fetchone()
        return _category(r)


@router.patch("/categories/{category_id}", response_model=Category)
def update_category(category_id: UUID, body: CategoryPatch, user: User):
    patch = body.model_dump(exclude_unset=True, exclude_none=True)
    with user_tx(user) as conn:
        if patch:
            sets = ", ".join(f"{col} = %({col})s" for col in patch)
            conn.execute(f"update categories set {sets} where id = %(id)s and user_id = %(uid)s", {**patch, "id": category_id, "uid": user.id})
        r = conn.execute("select id, name, kind, icon from categories where id = %s and user_id = %s", (category_id, user.id)).fetchone()
        if not r:
            raise HTTPException(404, "Category not found")
        return _category(r)


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: UUID, user: User):
    try:
        with user_tx(user) as conn:
            conn.execute("delete from categories where id = %s and user_id = %s", (category_id, user.id))
    except errors.ForeignKeyViolation:
        raise HTTPException(409, "This category has transactions. Move them to another category first.")


# ----------------------------------------------------------------------------------------- transactions

TXN_SELECT = """
select t.id, t.kind, t.amount, t.title, t.date, t.wallet_id, t.to_wallet_id, t.category_id, t.note, t.source,
  t.receipt_path,
  (select json_agg(json_build_object('name', i.name, 'qty', i.qty, 'price', i.price) order by i.position)
     from receipt_items i where i.transaction_id = t.id) as items
from transactions t
"""


def _txn(r: dict, receipt_url: str | None = None) -> Transaction:
    opt = lambda v: str(v) if v else None  # noqa: E731
    return Transaction(
        id=str(r["id"]), kind=r["kind"], amount=float(r["amount"]), title=r["title"], date=r["date"].isoformat(),
        wallet_id=str(r["wallet_id"]), to_wallet_id=opt(r["to_wallet_id"]), category_id=opt(r["category_id"]),
        note=r["note"], source=r["source"], items=r["items"] or None, receipt_url=receipt_url,
    )


def _filters(
    month: Month | None = None,
    kind: TransactionKind | None = None,
    wallet_id: Annotated[UUID | None, Query(alias="walletId")] = None,
    category_id: Annotated[UUID | None, Query(alias="categoryId")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    since: date | None = None,
) -> tuple[str, dict]:
    """WHERE clause (without user scope) and its parameters for the list and the CSV export."""
    conds, params = [], {}
    if month:
        conds.append("t.date >= %(start)s and t.date < %(end)s")
        params["start"], params["end"] = month_range(month)
    if since:
        conds.append("t.date >= %(since)s")
        params["since"] = since
    if kind:
        conds.append("t.kind = %(kind)s")
        params["kind"] = kind
    if wallet_id:
        conds.append("(t.wallet_id = %(wallet)s or t.to_wallet_id = %(wallet)s)")
        params["wallet"] = wallet_id
    if category_id:
        conds.append("t.category_id = %(category)s")
        params["category"] = category_id
    if search and search.strip():
        # Escape LIKE wildcards so "50%" searches for the text, not a pattern.
        params["q"] = "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        conds.append(
            "(t.title ilike %(q)s or t.note ilike %(q)s or exists "
            "(select 1 from receipt_items i where i.transaction_id = t.id and i.name ilike %(q)s))"
        )
    return "".join(f" and {c}" for c in conds), params


Filters = Annotated[tuple[str, dict], Depends(_filters)]
ORDER = " order by t.date desc, t.created_at desc, t.id"


@router.get("/transactions", response_model=list[Transaction], response_model_exclude_none=True)
def list_transactions(filters: Filters, user: User):
    where, params = filters
    with user_tx(user) as conn:
        rows = conn.execute(TXN_SELECT + " where t.user_id = %(uid)s" + where + ORDER, {**params, "uid": user.id})
        return [_txn(r) for r in rows]


def _csv_cell(v) -> str:
    # Spreadsheet apps run cells starting with = + - @ as formulas; prefix text cells so they stay text.
    s = str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


@router.get("/transactions/export.csv")
def export_transactions(filters: Filters, user: User, month: Month | None = None):
    where, params = filters
    with user_tx(user) as conn:
        rows = conn.execute(
            "select t.date, t.kind, t.title, t.amount, c.name as category, w.name as wallet, tw.name as to_wallet, t.note"
            " from transactions t join wallets w on w.id = t.wallet_id"
            " left join wallets tw on tw.id = t.to_wallet_id left join categories c on c.id = t.category_id"
            " where t.user_id = %(uid)s" + where + ORDER,
            {**params, "uid": user.id},
        ).fetchall()
    out = io.StringIO()
    out.write("\ufeff")  # BOM so Excel opens UTF-8 (₱, ñ) correctly
    w = csv.writer(out)
    w.writerow(["Date", "Type", "Description", "Amount", "Category", "Wallet", "To wallet", "Note"])
    for r in rows:
        w.writerow([
            r["date"].isoformat(), r["kind"], _csv_cell(r["title"]), f"{r['amount']:.2f}",
            _csv_cell(r["category"] or ""), _csv_cell(r["wallet"]), _csv_cell(r["to_wallet"] or ""), _csv_cell(r["note"]),
        ])
    return Response(
        out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="anttipid-{month or "all"}.csv"'},
    )


def _get_txn(conn, user: AuthUser, txn_id: UUID) -> dict:
    r = conn.execute(TXN_SELECT + " where t.user_id = %s and t.id = %s", (user.id, txn_id)).fetchone()
    if not r:
        raise HTTPException(404, "Transaction not found")
    return r


def category_kind(conn, user: AuthUser, category_id) -> str:
    """The kind of one of the user's categories. Raises 422 if it's gone."""
    row = conn.execute("select kind from categories where id = %s and user_id = %s", (category_id, user.id)).fetchone()
    if not row:
        raise HTTPException(422, "That category no longer exists.")
    return row["kind"]


def _normalize(conn, user: AuthUser, t: TransactionIn) -> TransactionIn:
    """Drop fields that don't belong to the kind, then check what's left. Raises 422 with a readable reason."""
    if t.kind == "transfer":
        t = t.model_copy(update={"category_id": None, "items": None})
        if not t.to_wallet_id:
            raise HTTPException(422, "Choose where the money goes.")
        if t.to_wallet_id == t.wallet_id:
            raise HTTPException(422, "Pick two different wallets.")
        return t
    t = t.model_copy(update={"to_wallet_id": None, **({} if t.kind == "expense" else {"items": None})})
    if not t.category_id:
        raise HTTPException(422, "Pick a category.")
    if category_kind(conn, user, t.category_id) != t.kind:
        raise HTTPException(422, f"Pick an {t.kind} category.")
    return t


def _write_items(conn, user: AuthUser, txn_id, items) -> None:
    conn.execute("delete from receipt_items where transaction_id = %s and user_id = %s", (txn_id, user.id))
    if items:
        with conn.cursor() as cur:
            cur.executemany(
                "insert into receipt_items (user_id, transaction_id, position, name, qty, price) values (%s, %s, %s, %s, %s, %s)",
                [(user.id, txn_id, n, i.name.strip()[:200], i.qty, i.price) for n, i in enumerate(items)],
            )


TXN_COLUMNS = ("kind", "amount", "title", "date", "wallet_id", "to_wallet_id", "category_id", "note", "source")


@router.post("/transactions", response_model=Transaction, response_model_exclude_none=True, status_code=201)
def create_transaction(body: TransactionIn, user: User):
    with user_tx(user) as conn:
        t = _normalize(conn, user, body)
        values = {c: getattr(t, c) for c in TXN_COLUMNS}
        r = conn.execute(
            f"insert into transactions (user_id, {', '.join(TXN_COLUMNS)})"
            f" values (%(uid)s, {', '.join(f'%({c})s' for c in TXN_COLUMNS)}) returning id",
            {**values, "uid": user.id},
        ).fetchone()
        _write_items(conn, user, r["id"], t.items)
        return _txn(_get_txn(conn, user, r["id"]))


@router.get("/transactions/{txn_id}", response_model=Transaction, response_model_exclude_none=True)
def get_transaction(txn_id: UUID, user: User):
    with user_tx(user) as conn:
        r = _get_txn(conn, user, txn_id)
    return _txn(r, storage.signed_url(user, r["receipt_path"]) if r["receipt_path"] else None)


@router.patch("/transactions/{txn_id}", response_model=Transaction, response_model_exclude_none=True)
def update_transaction(txn_id: UUID, body: TransactionPatch, user: User):
    with user_tx(user) as conn:
        r = _get_txn(conn, user, txn_id)
        current = TransactionIn(
            kind=r["kind"], amount=float(r["amount"]), title=r["title"], date=r["date"], wallet_id=r["wallet_id"],
            to_wallet_id=r["to_wallet_id"], category_id=r["category_id"], note=r["note"], source=r["source"], items=r["items"],
        )
        t = _normalize(conn, user, current.model_copy(update=body.model_dump(exclude_unset=True)))
        conn.execute(
            f"update transactions set {', '.join(f'{c} = %({c})s' for c in TXN_COLUMNS)} where id = %(id)s and user_id = %(uid)s",
            {**{c: getattr(t, c) for c in TXN_COLUMNS}, "id": txn_id, "uid": user.id},
        )
        if "items" in body.model_fields_set or t.items != current.items:
            _write_items(conn, user, txn_id, t.items)
        return _txn(_get_txn(conn, user, txn_id))


@router.delete("/transactions/{txn_id}", status_code=204)
def delete_transaction(txn_id: UUID, user: User):
    with user_tx(user) as conn:
        r = conn.execute(
            "delete from transactions where id = %s and user_id = %s returning receipt_path", (txn_id, user.id)
        ).fetchone()
        # Remove the photo before committing: if Storage fails, the row comes back and the user can retry,
        # instead of the row being gone with its photo left behind.
        if r and r["receipt_path"]:
            storage.remove(user, r["receipt_path"])


@router.post("/transactions/{txn_id}/receipt", status_code=204)
def upload_receipt(txn_id: UUID, image: UploadFile, user: User):
    """Attach the scanned photo after the transaction is saved. Replaces any earlier photo."""
    data = image.file.read(storage.MAX_BYTES + 1)
    if len(data) > storage.MAX_BYTES:
        raise HTTPException(413, "That photo is over 1 MB.")
    kind = storage.sniff_image(data)
    if not kind:
        raise HTTPException(415, "Upload a JPEG, PNG or WebP photo.")
    content_type, ext = kind
    path = f"{user.id}/{txn_id}.{ext}"
    with user_tx(user) as conn:
        old = _get_txn(conn, user, txn_id)["receipt_path"]
        storage.upload(user, path, data, content_type)
        conn.execute("update transactions set receipt_path = %s where id = %s and user_id = %s", (path, txn_id, user.id))
    if old and old != path:
        storage.remove(user, old)
