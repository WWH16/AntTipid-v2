"""Notifications: which warnings a save causes. The rules match frontend/src/lib/budget.ts, so email and screen agree."""

import math

from months import days_in


def peso(n: float) -> str:
    return f"₱{n:,.0f}"


def budget_state(spent: float, limit: float, warn_at: int) -> str:
    """ok, near, used or over: budgetState in budget.ts."""
    if spent > limit:
        return "over"
    if limit - spent < 0.005:  # to the centavo: sums of pesos can land a hair under the limit
        return "used"
    return "near" if spent >= limit * warn_at / 100 else "ok"


def runs_out(spent: float, limit: float, month: str, today_iso: str) -> str | None:
    """The day this pace runs out, when that's before month-end: pace in budget.ts. None: a past month, before day 5
    (too few days to go on), already over, or it lasts."""
    day = int(today_iso[8:])
    if month != today_iso[:7] or day < 5 or spent > limit or spent <= 0:
        return None
    out = day + (limit - spent) / (spent / day)
    return None if out >= days_in(month) else f"{month}-{math.ceil(out):02d}"


def end_line(limit: float, spent: float) -> str:
    """How a finished month ended against its monthly budget: endLine in budget.ts."""
    left = math.floor(limit - spent + 0.5)
    if left > 0:
        return f"You stayed {peso(left)} under your {peso(limit)} monthly budget."
    if left < 0:
        return f"You went {peso(-left)} over your {peso(limit)} monthly budget."
    return f"You used your whole {peso(limit)} monthly budget."
