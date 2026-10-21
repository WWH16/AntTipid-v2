"""Budgets and the monthly numbers behind Home, Budgets and Reports."""

from uuid import UUID

from fastapi import APIRouter, HTTPException
from psycopg import errors

from auth import AuthUser, User
from db import user_tx
from ledger import category_kind
from models import BudgetIn, BudgetStatus, CategoryTotal, DayPoint, Month, MonthlyReport, MonthSummary, TrendPoint
from months import days_in, days_shown, month_range, shift_month

router = APIRouter()

# ---------------------------------------------------------------------------------------------- budgets


@router.get("/budgets", response_model=list[BudgetStatus])
def list_budgets(month: Month, user: User):
    start, end = month_range(month)
    with user_tx(user) as conn:
        rows = conn.execute(
            """
            select b.id, b.category_id, b.limit_amount, b.warn_at,
              coalesce((select sum(t.amount) from transactions t
                        where t.user_id = b.user_id and t.kind = 'expense' and t.date >= %(start)s and t.date < %(end)s
                          and (b.category_id is null or t.category_id = b.category_id)), 0) as spent
            from budgets b where b.user_id = %(uid)s
            order by b.category_id nulls first, b.created_at
            """,
            {"uid": user.id, "start": start, "end": end},
        )
        return [
            BudgetStatus(
                id=str(r["id"]), category_id=str(r["category_id"]) if r["category_id"] else None,
                limit=float(r["limit_amount"]), warn_at=r["warn_at"], spent=float(r["spent"]),
            )
            for r in rows
        ]


def _check_category(conn, user: AuthUser, category_id: UUID | None) -> None:
    if category_id is not None and category_kind(conn, user, category_id) != "expense":
        raise HTTPException(422, "Budgets are for spending categories.")


@router.post("/budgets", status_code=204)
def create_budget(body: BudgetIn, user: User):
    """Set the limit for a category (or the whole month). Saving one that exists updates it."""
    with user_tx(user) as conn:
        _check_category(conn, user, body.category_id)
        conn.execute(
            """
            insert into budgets (user_id, category_id, limit_amount, warn_at) values (%s, %s, %s, %s)
            on conflict (user_id, category_id) do update set limit_amount = excluded.limit_amount, warn_at = excluded.warn_at
            """,
            (user.id, body.category_id, body.limit, body.warn_at),
        )


@router.put("/budgets/{budget_id}", status_code=204)
def update_budget(budget_id: UUID, body: BudgetIn, user: User):
    try:
        with user_tx(user) as conn:
            _check_category(conn, user, body.category_id)
            r = conn.execute(
                "update budgets set category_id = %s, limit_amount = %s, warn_at = %s where id = %s and user_id = %s returning id",
                (body.category_id, body.limit, body.warn_at, budget_id, user.id),
            ).fetchone()
            if not r:
                raise HTTPException(404, "Budget not found")
    except errors.UniqueViolation:
        raise HTTPException(409, "There's already a budget for that category.")


@router.delete("/budgets/{budget_id}", status_code=204)
def delete_budget(budget_id: UUID, user: User):
    with user_tx(user) as conn:
        conn.execute("delete from budgets where id = %s and user_id = %s", (budget_id, user.id))


# ---------------------------------------------------------------------------------------------- reports

TOTALS = """
select coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
       coalesce(sum(amount) filter (where kind = 'expense'), 0) as spent
from transactions where user_id = %(uid)s and date >= %(start)s and date < %(end)s
"""


@router.get("/reports/summary", response_model=MonthSummary)
def summary(month: Month, user: User):
    start, end = month_range(month)
    with user_tx(user) as conn:
        totals = conn.execute(TOTALS, {"uid": user.id, "start": start, "end": end}).fetchone()
        budget = conn.execute(
            "select limit_amount from budgets where user_id = %s and category_id is null", (user.id,)
        ).fetchone()
    return MonthSummary(
        month=month, income=float(totals["income"]), spent=float(totals["spent"]),
        budget=float(budget["limit_amount"]) if budget else 0, days_in_month=days_in(month), day_of_month=days_shown(month),
    )


@router.get("/reports/monthly", response_model=MonthlyReport)
def monthly(month: Month, user: User):
    start, end = month_range(month)
    trend_months = [shift_month(month, i - 5) for i in range(6)]
    trend_start, _ = month_range(trend_months[0])
    with user_tx(user) as conn:
        by_category = conn.execute(
            """
            select category_id, sum(amount) as total from transactions
            where user_id = %(uid)s and kind = 'expense' and date >= %(start)s and date < %(end)s
            group by category_id order by total desc
            """,
            {"uid": user.id, "start": start, "end": end},
        ).fetchall()
        trend = {
            r["month"]: r
            for r in conn.execute(
                """
                select to_char(date, 'YYYY-MM') as month,
                       coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
                       coalesce(sum(amount) filter (where kind = 'expense'), 0) as spent
                from transactions where user_id = %(uid)s and date >= %(start)s and date < %(end)s
                group by 1
                """,
                {"uid": user.id, "start": trend_start, "end": end},
            )
        }
        daily = {
            r["day"]: float(r["spent"])
            for r in conn.execute(
                """
                select extract(day from date)::int as day, sum(amount) as spent from transactions
                where user_id = %(uid)s and kind = 'expense' and date >= %(start)s and date < %(end)s
                group by 1
                """,
                {"uid": user.id, "start": start, "end": end},
            )
        }
    return MonthlyReport(
        month=month,
        by_category=[CategoryTotal(category_id=str(r["category_id"]), total=float(r["total"])) for r in by_category],
        trend=[
            TrendPoint(month=m, income=float(t["income"]), spent=float(t["spent"]))
            for m in trend_months
            for t in [trend.get(m, {"income": 0, "spent": 0})]
        ],
        daily=[DayPoint(day=d, spent=daily.get(d, 0)) for d in range(1, days_shown(month) + 1)],
    )
