// Shapes the FastAPI backend will return. Keep these in sync with the Pydantic models.
// Money is a number in pesos; dates are ISO strings (YYYY-MM-DD).

export type WalletType = 'cash' | 'e_wallet' | 'bank' | 'credit_card' | 'savings'

export interface Wallet {
  id: string
  name: string
  type: WalletType
  balance: number
  archived: boolean
}

export type CategoryKind = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  icon: string // key into components/category-icon.tsx
  /** Paid in one go each month (rent, tuition): left out of the spending pace. Spending categories only. */
  onceAMonth: boolean
}

export type TransactionKind = 'expense' | 'income' | 'transfer'

export interface Transaction {
  id: string
  kind: TransactionKind
  amount: number
  title: string
  date: string
  walletId: string
  toWalletId?: string // transfers only
  categoryId?: string // not set for transfers
  note: string
  source: 'manual' | 'receipt'
  items?: ReceiptItem[] // line items read from a scanned receipt; the amount stays the receipt total
  receiptUrl?: string // read-only: signed link to the receipt photo, only on GET /transactions/{id}; expires in 10 minutes
}

export type NewTransaction = Omit<Transaction, 'id' | 'receiptUrl'> & {
  /** The user's call when the add form said the amount is unusual (DSS feature 9). */
  anomalyDecision?: AnomalyDecision
  /** With "normal": count earlier similar one-offs as normal too. */
  anomalyAlsoEarlier?: boolean
}

export interface TransactionFilters {
  month?: string // YYYY-MM
  kind?: TransactionKind
  walletId?: string
  categoryId?: string
  search?: string
  since?: string // YYYY-MM-DD, inclusive
}

export interface Budget {
  id: string
  categoryId: string | null // null = whole month, all spending
  limit: number
  warnAt: number // percent, e.g. 80
}

/** Budget with this month's spending already added up by the server. */
export interface BudgetStatus extends Budget {
  spent: number
}

export interface MonthSummary {
  month: string
  income: number
  spent: number
  budget: number // overall monthly budget; 0 when none is set
  daysInMonth: number
  dayOfMonth: number
  /** Spent this month in each once-a-month category (0 when not paid yet). */
  fixed: { categoryId: string; total: number }[]
}

/** Every month with transactions, oldest first, for the month picker. */
export interface MonthHistory {
  budget: number // overall monthly budget as set now; 0 when none is set
  months: { month: string; spent: number }[]
}

export interface MonthlyReport {
  month: string
  byCategory: { categoryId: string; total: number }[]
  trend: { month: string; income: number; spent: number }[]
  /** Spending per day of the month, from day 1 up to today (current month) or the last day. */
  daily: { day: number; spent: number }[]
  /** The budgets this month had (null categoryId: the monthly budget). A finished month keeps the ones it ended with. */
  budgets: { categoryId: string | null; limit: number }[]
}

export interface ReceiptItem {
  name: string
  qty: number
  price: number
}

export interface ReceiptScan {
  merchant: string
  date: string
  total: number
  items: ReceiptItem[]
  suggestedCategoryId?: string
  lowConfidence?: boolean // items don't add up to the total; ask the user to double-check
  paymentMethod?: WalletType
  paymentLabel?: string // raw provider found, e.g. "GCash", "VISA", "Cash"
}

export interface User {
  name: string
  email: string
}

export type AnomalyDecision = 'one_off' | 'normal'

/** An unusual purchase this month (DSS feature 9): a one-off, or not decided yet (waiting for review). */
export interface Anomaly {
  transactionId: string
  categoryId: string
  amount: number
  decision: 'one_off' | null
  method: 'kmeans' | 'simple' | null
  /** The usual range as it was when the purchase was judged. */
  usualLow: number | null
  usualHigh: number | null
}

export interface SimilarOneOff {
  transactionId: string
  date: string
  amount: number
}

/** The same check for an amount not saved yet, so the add form can warn before saving. */
export interface AnomalyCheck {
  unusual: boolean
  method: 'kmeans' | 'simple' | 'none'
  usualLow: number | null
  usualHigh: number | null
  /** Earlier one-offs like it, newest first. */
  similar: SimilarOneOff[]
  /** The same amount, category and day is already saved. */
  duplicate: boolean
}
