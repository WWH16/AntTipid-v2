// In-memory stand-in for the FastAPI backend. Each exported handler matches one endpoint in api/endpoints.ts.
// ponytail: data resets on page reload; swap VITE_USE_MOCK=false once the backend exists.
import type {
  Budget, BudgetStatus, Category, MonthSummary, MonthlyReport, NewTransaction,
  Transaction, TransactionFilters, User, Wallet,
} from '@/types'
import { scanReceiptLocal } from '@/lib/receipt-ocr'

const categories: Category[] = [
  { id: 'food', name: 'Food & dining', kind: 'expense', icon: 'food' },
  { id: 'groceries', name: 'Groceries', kind: 'expense', icon: 'groceries' },
  { id: 'transport', name: 'Transport', kind: 'expense', icon: 'transport' },
  { id: 'bills', name: 'Bills & utilities', kind: 'expense', icon: 'bills' },
  { id: 'load', name: 'Load & internet', kind: 'expense', icon: 'phone' },
  { id: 'shopping', name: 'Shopping', kind: 'expense', icon: 'shopping' },
  { id: 'health', name: 'Health', kind: 'expense', icon: 'health' },
  { id: 'fun', name: 'Going out', kind: 'expense', icon: 'fun' },
  { id: 'salary', name: 'Salary', kind: 'income', icon: 'salary' },
  { id: 'freelance', name: 'Freelance', kind: 'income', icon: 'freelance' },
  { id: 'gift', name: 'Gifts', kind: 'income', icon: 'gift' },
]

// Balances the sample wallets should show today; opening balances are worked out from these after seeding.
const target: Record<string, number> = { cash: 2350, gcash: 4870, bpi: 48200, maya: 960, card: -8420 }
const opening: Record<string, number> = {}
const wallets: Omit<Wallet, 'balance'>[] = [
  { id: 'cash', name: 'Cash', type: 'cash', archived: false },
  { id: 'gcash', name: 'GCash', type: 'e_wallet', archived: false },
  { id: 'bpi', name: 'BPI Savings', type: 'savings', archived: false },
  { id: 'maya', name: 'Maya', type: 'e_wallet', archived: false },
  { id: 'card', name: 'BDO Credit Card', type: 'credit_card', archived: false },
]

const budgets: Budget[] = [
  { id: 'b-all', categoryId: null, limit: 17000, warnAt: 80 },
  { id: 'b-food', categoryId: 'food', limit: 3000, warnAt: 80 },
  { id: 'b-groc', categoryId: 'groceries', limit: 3600, warnAt: 80 },
  { id: 'b-trans', categoryId: 'transport', limit: 1500, warnAt: 80 },
  { id: 'b-fun', categoryId: 'fun', limit: 500, warnAt: 75 },
  { id: 'b-shop', categoryId: 'shopping', limit: 4000, warnAt: 80 },
]

const iso = (d: Date) => d.toISOString().slice(0, 10)
const monthOf = (date: string) => date.slice(0, 7)

// Repeating pattern of everyday spending, laid over the last six months.
const pattern: [string, string, string, number][] = [
  ['Jollibee', 'food', 'gcash', 289], ['SM Supermarket', 'groceries', 'card', 2140],
  ['Grab ride', 'transport', 'gcash', 214], ['Meralco', 'bills', 'bpi', 2860],
  ['Globe prepaid', 'load', 'gcash', 299], ['Mang Inasal', 'food', 'cash', 199],
  ['Jeepney & MRT', 'transport', 'cash', 120], ['Uniqlo', 'shopping', 'card', 1490],
  ['Mercury Drug', 'health', 'cash', 438], ['Puregold', 'groceries', 'maya', 1325],
  ['Starbucks', 'food', 'maya', 220], ['Cinema – Ayala', 'fun', 'gcash', 560],
  ['Maynilad', 'bills', 'bpi', 640], ['Angkas', 'transport', 'gcash', 96],
  ['Lazada', 'shopping', 'gcash', 875], ['Samgyup night', 'fun', 'cash', 650],
  ['7-Eleven', 'food', 'cash', 145], ['PLDT Fibr', 'load', 'bpi', 1699],
]

function seed(): Transaction[] {
  const out: Transaction[] = []
  const today = new Date()
  let n = 0
  for (let back = 5; back >= 0; back--) {
    const first = new Date(today.getFullYear(), today.getMonth() - back, 1)
    const last = back === 0 ? today.getDate() : new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const day = (d: number) => iso(new Date(first.getFullYear(), first.getMonth(), Math.min(d, last), 12))
    out.push({ id: `t${n++}`, kind: 'income', amount: 32000, title: 'Payroll – Acme Corp', date: day(1), walletId: 'bpi', categoryId: 'salary', note: '', source: 'manual' })
    if (last >= 15) out.push({ id: `t${n++}`, kind: 'income', amount: back % 2 ? 6500 : 4200, title: 'Logo project', date: day(15), walletId: 'gcash', categoryId: 'freelance', note: '', source: 'manual' })
    if (last >= 5) out.push({ id: `t${n++}`, kind: 'transfer', amount: 5000, title: 'Top up GCash', date: day(5), walletId: 'bpi', toWalletId: 'gcash', note: '', source: 'manual' })
    // ~1 spend every 1.4 days, amounts nudged per month so the trend chart is not flat.
    for (let d = 1, i = back * 3; d <= last; d += 1 + (i % 2) * 0.8, i++) {
      const [title, categoryId, walletId, base] = pattern[i % pattern.length]
      const amount = Math.round(base * (0.85 + ((i * 37 + back * 11) % 30) / 100))
      out.push({ id: `t${n++}`, kind: 'expense', amount, title, date: day(Math.floor(d)), walletId, categoryId, note: '', source: i % 7 === 0 ? 'receipt' : 'manual' })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

let transactions = seed()
for (const id in target) opening[id] = target[id] - balanceOf(id)
let nextId = 10_000

const delay = <T,>(value: T, ms = 180) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), ms))
const fail = (message: string) => Promise.reject(new Error(message))

function balanceOf(walletId: string) {
  return transactions.reduce((sum, t) => {
    if (t.kind === 'income' && t.walletId === walletId) return sum + t.amount
    if (t.kind === 'expense' && t.walletId === walletId) return sum - t.amount
    if (t.kind === 'transfer') {
      if (t.walletId === walletId) return sum - t.amount
      if (t.toWalletId === walletId) return sum + t.amount
    }
    return sum
  }, opening[walletId] ?? 0)
}

const isCurrentMonth = (month: string) => month === iso(new Date()).slice(0, 7)

const incomeIn = (month: string) =>
  transactions.filter((t) => t.kind === 'income' && monthOf(t.date) === month).reduce((s, t) => s + t.amount, 0)

const spentIn = (month: string, categoryId?: string | null) =>
  transactions
    .filter((t) => t.kind === 'expense' && monthOf(t.date) === month && (!categoryId || t.categoryId === categoryId))
    .reduce((s, t) => s + t.amount, 0)

export const mock = {
  signIn: (email: string, _password?: string) => delay<User>({ name: 'Andrea Santos', email }),

  listWallets: () => delay<Wallet[]>(wallets.map((w) => ({ ...w, balance: balanceOf(w.id) }))),
  createWallet: (w: Pick<Wallet, 'name' | 'type' | 'balance'>) => {
    const id = `w${nextId++}`
    opening[id] = w.balance
    wallets.push({ id, name: w.name, type: w.type, archived: false })
    return delay({ ...w, id, archived: false })
  },
  updateWallet: (id: string, patch: Partial<Pick<Wallet, 'name' | 'archived'>>) => {
    const w = wallets.find((x) => x.id === id)
    if (!w) return fail('Wallet not found')
    Object.assign(w, patch)
    return delay({ ...w, balance: balanceOf(id) })
  },

  listCategories: () => delay(categories),
  createCategory: (c: Omit<Category, 'id'>) => {
    const created = { ...c, id: `c${nextId++}` }
    categories.push(created)
    return delay(created)
  },
  updateCategory: (id: string, patch: Partial<Pick<Category, 'name'>>) => {
    const c = categories.find((x) => x.id === id)
    if (!c) return fail('Category not found')
    Object.assign(c, patch)
    return delay(c)
  },
  deleteCategory: (id: string) => {
    if (transactions.some((t) => t.categoryId === id)) return fail('This category has transactions. Move them to another category first.')
    categories.splice(categories.findIndex((c) => c.id === id), 1)
    return delay(null)
  },

  listTransactions: (f: TransactionFilters = {}) => {
    const q = f.search?.trim().toLowerCase()
    return delay(transactions.filter((t) =>
      (!f.month || monthOf(t.date) === f.month) &&
      (!f.kind || t.kind === f.kind) &&
      (!f.walletId || t.walletId === f.walletId || t.toWalletId === f.walletId) &&
      (!f.categoryId || t.categoryId === f.categoryId) &&
      (!q || t.title.toLowerCase().includes(q) || t.note.toLowerCase().includes(q))))
  },
  getTransaction: (id: string) => {
    const t = transactions.find((x) => x.id === id)
    return t ? delay(t) : fail('Transaction not found')
  },
  createTransaction: (t: NewTransaction) => {
    const created = { ...t, id: `t${nextId++}` }
    transactions = [created, ...transactions].sort((a, b) => b.date.localeCompare(a.date))
    return delay(created)
  },
  updateTransaction: (id: string, patch: Partial<NewTransaction>) => {
    const t = transactions.find((x) => x.id === id)
    if (!t) return fail('Transaction not found')
    Object.assign(t, patch)
    return delay(t)
  },
  deleteTransaction: (id: string) => {
    transactions = transactions.filter((t) => t.id !== id)
    return delay(null)
  },

  listBudgets: (month: string) =>
    delay<BudgetStatus[]>(budgets.map((b) => ({ ...b, spent: spentIn(month, b.categoryId) }))),
  saveBudget: (b: Omit<Budget, 'id'> & { id?: string }) => {
    const existing = budgets.find((x) => x.id === b.id || x.categoryId === b.categoryId)
    if (existing) Object.assign(existing, b, { id: existing.id })
    else budgets.push({ ...b, id: `b${nextId++}` })
    return delay(null)
  },
  deleteBudget: (id: string) => {
    budgets.splice(budgets.findIndex((b) => b.id === id), 1)
    return delay(null)
  },

  summary: (month: string) => {
    const [y, m] = month.split('-').map(Number)
    const now = new Date()
    const isCurrent = now.getFullYear() === y && now.getMonth() + 1 === m
    const daysInMonth = new Date(y, m, 0).getDate()
    return delay<MonthSummary>({
      month,
      income: incomeIn(month),
      spent: spentIn(month),
      budget: budgets.find((b) => b.categoryId === null)?.limit ?? 0,
      daysInMonth,
      dayOfMonth: isCurrent ? now.getDate() : daysInMonth,
    })
  },

  report: (month: string) => {
    const totals = new Map<string, number>()
    for (const t of transactions) {
      if (t.kind === 'expense' && monthOf(t.date) === month && t.categoryId)
        totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount)
    }
    const [y, m] = month.split('-').map(Number)
    const trend = Array.from({ length: 6 }, (_, i) => {
      const key = iso(new Date(y, m - 6 + i, 15)).slice(0, 7)
      return { month: key, income: incomeIn(key), spent: spentIn(key) }
    })
    return delay<MonthlyReport>({
      month,
      byCategory: [...totals].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total),
      trend,
      daily: Array.from({ length: isCurrentMonth(month) ? new Date().getDate() : new Date(y, m, 0).getDate() }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`
        return { day: i + 1, spent: transactions.filter((t) => t.kind === 'expense' && t.date === date).reduce((s, t) => s + t.amount, 0) }
      }),
    })
  },

  scanReceipt: (file: File) => scanReceiptLocal(file),
}
