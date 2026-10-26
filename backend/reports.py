"""Budgets and the monthly numbers behind Home, Budgets and Reports."""

from datetime import date as Date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from psycopg import errors

from anomalies import judge, mark_normal, record_unchecked, similar_one_offs
from auth import AuthUser, User
from db import user_tx
from ledger import category_kind
from models import (
    Anomaly, AnomalyCheck, AnomalyDecisionIn, BudgetIn, BudgetLimit, BudgetStatus, CategoryTotal, DayPoint, Month, MonthHistory, MonthlyReport, MonthSummary, MonthTotal, SimilarOneOff, TrendPoint,
)
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


def _check_fits(conn, user: AuthUser, budget_id: UUID | None, category_id: UUID | None, limit: float) -> None:
    """Category budgets are shares of the monthly budget, so together they can't add up to more than it.
    Checked from either side: a category limit against what's left to assign, a monthly limit against what's assigned.
    The budget being saved (by id, or by category for the upsert) is left out of what's assigned."""
    r = conn.execute(
        """
        select (select limit_amount from budgets where user_id = %(uid)s and category_id is null) as monthly,
               (select coalesce(sum(limit_amount), 0) from budgets
                where user_id = %(uid)s and category_id is not null
                  and id is distinct from %(id)s and category_id is distinct from %(cat)s) as assigned
        """,
        {"uid": user.id, "id": budget_id, "cat": category_id},
    ).fetchone()
    monthly, assigned = r["monthly"], r["assigned"]
    if category_id is None and limit < assigned:
        raise HTTPException(422, f"Your category budgets add up to ₱{assigned:,.0f}. The monthly budget can't be less.")
    if category_id is not None and monthly is not None and limit > (left := monthly - assigned):
        raise HTTPException(422, f"Only ₱{left:,.0f} of your ₱{monthly:,.0f} monthly budget is unassigned." if left > 0
                            else f"Your category budgets already use all of your ₱{monthly:,.0f} monthly budget.")


@router.post("/budgets", status_code=204)
def create_budget(body: BudgetIn, user: User):
    """Set the limit for a category (or the whole month). Saving one that exists updates it."""
    with user_tx(user) as conn:
        _check_category(conn, user, body.category_id)
        _check_fits(conn, user, None, body.category_id, body.limit)
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
            _check_fits(conn, user, budget_id, body.category_id, body.limit)
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

def _budgets_in(conn, user: AuthUser, start) -> list[dict]:
    """The budgets a month had (the month starting at `start`): each one's latest limit from budget_history up to
    then, leaving out ones removed by then. The current month reads the same as the budgets table."""
    return [
        r for r in conn.execute(
            """
            select distinct on (category_id) category_id, limit_amount from budget_history
            where user_id = %s and month <= %s order by category_id, month desc
            """,
            (user.id, start),
        )
        if r["limit_amount"] is not None
    ]


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
        budget = next((b for b in _budgets_in(conn, user, start) if b["category_id"] is None), None)
        fixed = conn.execute(
            """
            select c.id as category_id, coalesce(sum(t.amount), 0) as total from categories c
            left join transactions t on t.category_id = c.id and t.kind = 'expense' and t.date >= %(start)s and t.date < %(end)s
            where c.user_id = %(uid)s and c.once_a_month
            group by c.id
            """,
            {"uid": user.id, "start": start, "end": end},
        ).fetchall()
    return MonthSummary(
        month=month, income=float(totals["income"]), spent=float(totals["spent"]),
        budget=float(budget["limit_amount"]) if budget else 0, days_in_month=days_in(month), day_of_month=days_shown(month),
        fixed=[CategoryTotal(category_id=str(r["category_id"]), total=float(r["total"])) for r in fixed],
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
        budgets = _budgets_in(conn, user, start)
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
        budgets=[
            BudgetLimit(category_id=str(b["category_id"]) if b["category_id"] else None, limit=float(b["limit_amount"]))
            for b in budgets
        ],
    )


@router.get("/reports/months", response_model=MonthHistory)
def month_history(user: User):
    """Totals for every month with transactions, oldest first: the month picker's range, amounts and budget marks."""
    with user_tx(user) as conn:
        rows = conn.execute(
            """
            select to_char(date, 'YYYY-MM') as month, coalesce(sum(amount) filter (where kind = 'expense'), 0) as spent
            from transactions where user_id = %s
            group by 1 order by 1
            """,
            (user.id,),
        ).fetchall()
        budget = conn.execute(
            "select limit_amount from budgets where user_id = %s and category_id is null", (user.id,)
        ).fetchone()
    return MonthHistory(
        budget=float(budget["limit_amount"]) if budget else 0,
        months=[MonthTotal(month=r["month"], spent=float(r["spent"])) for r in rows],
    )


# ---------------------------------------------------------------------------------------------- unusual purchases


@router.get("/anomalies", response_model=list[Anomaly])
def anomalies(month: Month, user: User):
    """This month's unusual purchases (DSS feature 9) that aren't called normal: one-offs and ones waiting for review.
    Verdicts are kept from when each was saved; a purchase saved before verdicts were kept is judged once now, on the
    history before it, in the order they were saved."""
    start, end = month_range(month)
    with user_tx(user) as conn:
        unchecked = conn.execute(
            """
            select t.id from transactions t
            join categories c on c.id = t.category_id and not c.once_a_month
            left join anomaly_checks a on a.transaction_id = t.id
            where t.user_id = %s and t.kind = 'expense' and t.date >= %s and t.date < %s and a.transaction_id is null
            order by t.date, t.created_at
            """,
            (user.id, start, end),
        ).fetchall()
        record_unchecked(conn, user.id, [r["id"] for r in unchecked])
        rows = conn.execute(
            """
            select t.id, t.category_id, t.amount, a.decision, a.method, a.usual_low, a.usual_high
            from transactions t
            join categories c on c.id = t.category_id and not c.once_a_month
            join anomaly_checks a on a.transaction_id = t.id and a.unusual and a.decision is distinct from 'normal'
            where t.user_id = %s and t.date >= %s and t.date < %s
            order by t.date, t.created_at
            """,
            (user.id, start, end),
        ).fetchall()
    num = lambda v: float(v) if v is not None else None  # noqa: E731
    return [
        Anomaly(transaction_id=str(r["id"]), category_id=str(r["category_id"]), amount=float(r["amount"]), decision=r["decision"],
                method=r["method"], usual_low=num(r["usual_low"]), usual_high=num(r["usual_high"]))
        for r in rows
    ]


@router.get("/anomalies/check", response_model=AnomalyCheck)
def check_anomaly(
    user: User,
    category_id: Annotated[UUID, Query(alias="categoryId")],
    amount: Annotated[float, Query(gt=0, lt=1e12)],
    date: Date,
    exclude: UUID | None = None,
):
    """Would this expense be unusual? Run by the add form before saving, on the amount being typed; `exclude` is the
    transaction being edited. Also the earlier one-offs like it, and whether it looks like a duplicate."""
    with user_tx(user) as conn:
        v = judge(conn, user.id, category_id, amount, date, exclude=exclude)
        similar, duplicate = similar_one_offs(conn, user.id, category_id, amount, date, exclude=exclude)
    unusual = bool(v and "new" in v.flagged)
    return AnomalyCheck(
        unusual=unusual, method=v.method if v else "none",
        usual_low=v.usual[0] if v and v.usual else None, usual_high=v.usual[1] if v and v.usual else None,
        similar=[SimilarOneOff(**r) for r in similar], duplicate=duplicate,
    )


@router.put("/anomalies/{transaction_id}/decision", response_model=list[SimilarOneOff])
def decide_anomaly(transaction_id: UUID, body: AnomalyDecisionIn, user: User):
    """The user's call on a flagged purchase: one-off, normal, or back to not decided. After "normal", the earlier
    similar one-offs still one-offs come back, to ask about once; also_earlier counts them as normal too."""
    with user_tx(user) as conn:
        t = conn.execute(
            """
            select t.category_id, t.amount, t.date from transactions t
            join anomaly_checks a on a.transaction_id = t.id and a.unusual
            where t.id = %s and t.user_id = %s
            """,
            (transaction_id, user.id),
        ).fetchone()
        if not t:
            raise HTTPException(404, "No unusual purchase with that id")
        conn.execute("update anomaly_checks set decision = %s where transaction_id = %s", (body.decision, transaction_id))
        earlier = []
        if body.decision == "normal":
            earlier = similar_one_offs(conn, user.id, t["category_id"], float(t["amount"]), t["date"], exclude=transaction_id)[0]
            if body.also_earlier:
                mark_normal(conn, earlier)
                earlier = []
    return [SimilarOneOff(**e) for e in earlier]
