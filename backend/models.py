"""Request and response shapes. Mirrors frontend/src/types.ts; JSON is camelCase, Python is snake_case."""

from datetime import date as Date
from typing import Annotated, Literal
from uuid import UUID

from annotated_types import Ge, Gt, Le, Lt, MaxLen
from pydantic import StringConstraints

from receipts import CamelModel, ReceiptItem

WalletType = Literal["cash", "e_wallet", "bank", "credit_card", "savings"]
CategoryKind = Literal["expense", "income"]
TransactionKind = Literal["expense", "income", "transfer"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
ShortName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
IconKey = Annotated[str, StringConstraints(min_length=1, max_length=40)]
TitleStr = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
NoteStr = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Money = Annotated[float, Gt(0), Lt(1e12)]
Balance = Annotated[float, Gt(-1e12), Lt(1e12)]
Percent = Annotated[int, Ge(1), Le(100)]
class ReceiptItemIn(CamelModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    qty: Annotated[float, Gt(0), Lt(1e7)]
    price: Annotated[float, Ge(0), Lt(1e12)]


ItemList = Annotated[list[ReceiptItemIn], MaxLen(200)]
Month = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class Wallet(CamelModel):
    id: str
    name: str
    type: WalletType
    balance: float
    archived: bool


class WalletIn(CamelModel):
    name: Name
    type: WalletType
    balance: Balance = 0  # opening balance


class WalletPatch(CamelModel):
    name: Name | None = None
    type: WalletType | None = None
    balance: Balance | None = None
    archived: bool | None = None


class Category(CamelModel):
    id: str
    name: str
    kind: CategoryKind
    icon: str
    once_a_month: bool  # paid in one go each month (rent, tuition): left out of the spending pace


class CategoryIn(CamelModel):
    name: ShortName
    kind: CategoryKind
    icon: IconKey = "other"
    once_a_month: bool = False


class CategoryPatch(CamelModel):
    name: ShortName | None = None
    icon: IconKey | None = None
    once_a_month: bool | None = None


class TransactionIn(CamelModel):
    kind: TransactionKind
    amount: Money
    title: TitleStr
    date: Date
    wallet_id: UUID
    to_wallet_id: UUID | None = None
    category_id: UUID | None = None
    note: NoteStr = ""
    source: Literal["manual", "receipt"] = "manual"
    items: ItemList | None = None
    # The user's call when the add form warned the amount is unusual (DSS feature 9); also_earlier: count earlier
    # similar one-offs as normal too.
    anomaly_decision: Literal["one_off", "normal"] | None = None
    anomaly_also_earlier: bool = False


class TransactionPatch(CamelModel):
    """Any subset of TransactionIn. The merged result is validated as a whole."""

    kind: TransactionKind | None = None
    amount: Money | None = None
    title: TitleStr | None = None
    date: Date | None = None
    wallet_id: UUID | None = None
    to_wallet_id: UUID | None = None
    category_id: UUID | None = None
    note: NoteStr | None = None
    source: Literal["manual", "receipt"] | None = None
    items: ItemList | None = None
    anomaly_decision: Literal["one_off", "normal"] | None = None
    anomaly_also_earlier: bool | None = None


class Transaction(CamelModel):
    id: str
    kind: TransactionKind
    amount: float
    title: str
    date: str
    wallet_id: str
    to_wallet_id: str | None = None
    category_id: str | None = None
    note: str
    source: Literal["manual", "receipt"]
    items: list[ReceiptItem] | None = None
    receipt_url: str | None = None  # only on GET /transactions/{id}; signed, expires in 10 minutes


class BudgetIn(CamelModel):
    category_id: UUID | None = None
    limit: Money
    warn_at: Percent = 80


class BudgetStatus(CamelModel):
    id: str
    category_id: str | None
    limit: float
    warn_at: int
    spent: float


class CategoryTotal(CamelModel):
    category_id: str
    total: float


class BudgetLimit(CamelModel):
    category_id: str | None  # None is the overall monthly budget
    limit: float


class MonthSummary(CamelModel):
    month: str
    income: float
    spent: float
    budget: float  # the month's overall monthly budget (from budget_history); 0 when none
    days_in_month: int
    day_of_month: int
    # Spent this month in each once-a-month category (0 when not paid yet), for the pace to leave out.
    fixed: list[CategoryTotal]


class TrendPoint(CamelModel):
    month: str
    income: float
    spent: float


class DayPoint(CamelModel):
    day: int
    spent: float


class MonthlyReport(CamelModel):
    month: str
    by_category: list[CategoryTotal]
    trend: list[TrendPoint]
    daily: list[DayPoint]
    # The budgets this month had (from budget_history), so a finished month is read against them, not today's.
    budgets: list[BudgetLimit]


class Anomaly(CamelModel):
    """An unusual purchase this month (DSS feature 9), with the range its category usually stays in."""
    transaction_id: str
    category_id: str
    amount: float
    decision: Literal["one_off"] | None  # None: not decided yet, waiting for review
    method: Literal["kmeans", "simple"] | None
    usual_low: float | None  # the usual range as it was when judged
    usual_high: float | None


class SimilarOneOff(CamelModel):
    transaction_id: str
    date: Date
    amount: float


class AnomalyCheck(CamelModel):
    """The same check for an amount not saved yet, so the add form can warn before saving."""
    unusual: bool
    method: Literal["kmeans", "simple", "none"]
    usual_low: float | None
    usual_high: float | None
    similar: list[SimilarOneOff]  # earlier one-offs like it, newest first
    duplicate: bool  # the same amount, category and day is already saved


class AnomalyDecisionIn(CamelModel):
    decision: Literal["one_off", "normal"] | None  # None: back to not decided
    also_earlier: bool = False



class MonthTotal(CamelModel):
    month: str
    spent: float


class MonthHistory(CamelModel):
    budget: float  # overall monthly budget as set now; 0 when none is set
    months: list[MonthTotal]  # only months that have transactions, oldest first
