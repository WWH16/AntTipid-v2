// Every call the app makes. Each line is: mock handler when VITE_USE_MOCK is on, real FastAPI route otherwise.
import { mock } from '@/mocks/db'
import { authMessage, supabase, toUser } from '@/lib/supabase'
import type {
  Budget, BudgetStatus, Category, MonthSummary, MonthlyReport, NewTransaction,
  ReceiptScan, Transaction, TransactionFilters, User, Wallet,
} from '@/types'
import { USE_MOCK, download, http, json } from './client'

const pick = <A extends unknown[], R>(m: (...a: A) => Promise<R>, real: (...a: A) => Promise<R>) =>
  (...a: A) => (USE_MOCK ? m(...a) : real(...a))

/** Photos go up with an extension matching their type (WebP, or JPEG from Safari). */
const photoName = (photo: Blob, base: string) => `${base}.${photo.type === 'image/webp' ? 'webp' : 'jpg'}`

export const api = {
  // Sign-in is the one thing done with supabase-js directly; the session's token then goes to FastAPI on every call.
  auth: {
    signIn: pick(mock.signIn, async (email: string, password?: string): Promise<User> => {
      const { data, error } = await supabase!.auth.signInWithPassword({ email, password: password ?? '' })
      if (error) throw new Error(authMessage(error))
      return toUser(data.user)
    }),
    /** null: the account exists but the email link must be opened before signing in. */
    signUp: pick(mock.signUp, async (name: string, email: string, password: string): Promise<User | null> => {
      const { data, error } = await supabase!.auth.signUp({
        email, password, options: { data: { name }, emailRedirectTo: `${location.origin}/sign-in` },
      })
      if (error) throw new Error(authMessage(error))
      return data.session && data.user ? toUser(data.user) : null
    }),
    checkEmail: pick(
      async (_email: string) => ({ exists: false }),
      (email: string) => http<{ exists: boolean }>('/auth/check-email', { query: { email } })
    ),
    resetPassword: pick(mock.resetPassword, async (email: string): Promise<void> => {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/sign-in?mode=reset`,
      })
      if (error) throw new Error(authMessage(error))
    }),
    resendSignUp: pick(mock.resetPassword, async (email: string): Promise<void> => {
      const { error } = await supabase!.auth.resend({ type: 'signup', email })
      if (error) throw new Error(authMessage(error))
    }),
    updatePassword: pick(mock.updatePassword, async (password: string): Promise<User> => {
      const { data, error } = await supabase!.auth.updateUser({ password })
      if (error || !data.user) throw new Error(error ? authMessage(error) : "Couldn't update your password.")
      return toUser(data.user)
    }),
    updateUser: pick(mock.updateUser, async (name: string, _email?: string): Promise<User> => {
      const { data, error } = await supabase!.auth.updateUser({ data: { name } })
      if (error || !data.user) throw new Error(error ? authMessage(error) : "Couldn't update your profile.")
      return toUser(data.user)
    }),
    signOut: pick(mock.signOut, async () => { await supabase!.auth.signOut(); return null }),
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
    /** Attach the scanned photo (the shrinkPhoto copy) once the transaction is saved. Max 1 MB. */
    uploadReceipt: pick(mock.uploadReceipt, (id: string, photo: Blob) => {
      const body = new FormData()
      body.append('image', photo, photoName(photo, id))
      return http<null>(`/transactions/${id}/receipt`, { method: 'POST', body })
    }),
    /** CSV of the filtered list. The mock builds the file in the browser instead (pages/activity.tsx). */
    exportCsv: (f: TransactionFilters) => download('/transactions/export.csv', { ...f }, `anttipid-${f.month ?? 'all'}.csv`),
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
    // Expects a photo already shrunk with shrinkPhoto (the scan panel reuses it for the preview and the upload).
    scan: (photo: Blob, signal?: AbortSignal) => {
      const body = new FormData()
      body.append('image', photo, photoName(photo, 'receipt'))
      return http<ReceiptScan>('/receipts/scan', { method: 'POST', body, signal })
    },
  },
}
