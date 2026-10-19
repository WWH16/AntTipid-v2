// Every call the app makes. Each line is: mock handler when VITE_USE_MOCK is on, real FastAPI route otherwise.
import { mock } from '@/mocks/db'
import type {
  Budget, BudgetStatus, Category, MonthSummary, MonthlyReport, NewTransaction,
  ReceiptScan, Transaction, TransactionFilters, User, Wallet,
} from '@/types'
import { API_URL, USE_MOCK, http, json } from './client'

const pick = <A extends unknown[], R>(m: (...a: A) => Promise<R>, real: (...a: A) => Promise<R>) =>
  (...a: A) => (USE_MOCK ? m(...a) : real(...a))

export const api = {
  auth: {
    signIn: pick(mock.signIn, (email: string, password?: string) => http<User>('/auth/sign-in', json('POST', { email, password }))),
  },
  wallets: {
    list: pick(mock.listWallets, () => http<Wallet[]>('/wallets')),
    create: pick(mock.createWallet, (w) => http<Wallet>('/wallets', json('POST', w))),
    update: pick(mock.updateWallet, (id, patch) => http<Wallet>(`/wallets/${id}`, json('PATCH', patch))),
  },
  categories: {
    list: pick(mock.listCategories, () => http<Category[]>('/categories')),
    create: pick(mock.createCategory, (c) => http<Category>('/categories', json('POST', c))),
    update: pick(mock.updateCategory, (id, patch) => http<Category>(`/categories/${id}`, json('PATCH', patch))),
    remove: pick(mock.deleteCategory, (id) => http<null>(`/categories/${id}`, { method: 'DELETE' })),
  },
  transactions: {
    list: pick(mock.listTransactions, (f: TransactionFilters = {}) => http<Transaction[]>('/transactions', { query: { ...f } })),
    get: pick(mock.getTransaction, (id) => http<Transaction>(`/transactions/${id}`)),
    create: pick(mock.createTransaction, (t: NewTransaction) => http<Transaction>('/transactions', json('POST', t))),
    update: pick(mock.updateTransaction, (id, patch) => http<Transaction>(`/transactions/${id}`, json('PATCH', patch))),
    remove: pick(mock.deleteTransaction, (id) => http<null>(`/transactions/${id}`, { method: 'DELETE' })),
  },
  budgets: {
    list: pick(mock.listBudgets, (month: string) => http<BudgetStatus[]>('/budgets', { query: { month } })),
    save: pick(mock.saveBudget, (b: Omit<Budget, 'id'> & { id?: string }) =>
      b.id ? http<null>(`/budgets/${b.id}`, json('PUT', b)) : http<null>('/budgets', json('POST', b))),
    remove: pick(mock.deleteBudget, (id) => http<null>(`/budgets/${id}`, { method: 'DELETE' })),
  },
  reports: {
    summary: pick(mock.summary, (month: string) => http<MonthSummary>('/reports/summary', { query: { month } })),
    monthly: pick(mock.report, (month: string) => http<MonthlyReport>('/reports/monthly', { query: { month } })),
  },
  receipts: {
    // Always the real backend, even in mock mode: reading receipts needs the server's API key.
    // Expects a photo already shrunk with shrinkPhoto (the scan panel reuses it for the preview).
    scan: (photo: Blob) => {
      const body = new FormData()
      body.append('image', photo, 'receipt.jpg')
      return http<ReceiptScan>('/receipts/scan', { method: 'POST', body })
    },
  },
}

/** CSV export is a plain link to the backend; the mock builds the file in the browser instead. */
export const exportCsvUrl = (f: TransactionFilters) =>
  `${API_URL}/transactions/export.csv?${new URLSearchParams(f as Record<string, string>)}`
