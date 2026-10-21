"""Month arithmetic. "Today" is the user's calendar day, in APP_TIMEZONE (default Asia/Manila), not the server's UTC."""

import calendar
import os
from datetime import date, datetime
from zoneinfo import ZoneInfo


def today() -> date:
    return datetime.now(ZoneInfo(os.environ.get("APP_TIMEZONE", "Asia/Manila"))).date()


def current_month() -> str:
    return today().strftime("%Y-%m")


def shift_month(month: str, delta: int) -> str:
    y, m = map(int, month.split("-"))
    n = y * 12 + (m - 1) + delta
    return f"{n // 12:04d}-{n % 12 + 1:02d}"


def month_range(month: str) -> tuple[date, date]:
    """First day of the month and first day of the next one (end exclusive)."""
    y, m = map(int, month.split("-"))
    ny, nm = map(int, shift_month(month, 1).split("-"))
    return date(y, m, 1), date(ny, nm, 1)


def days_in(month: str) -> int:
    y, m = map(int, month.split("-"))
    return calendar.monthrange(y, m)[1]


def days_shown(month: str) -> int:
    """Up to today in the current month, the whole month otherwise."""
    return today().day if month == current_month() else days_in(month)
