// Every call the app makes: Supabase Auth for sign-in, the FastAPI backend for everything else.
import { authMessage, supabase, toUser } from '@/lib/supabase'
import type {
  Budget, BudgetStatus, Category, MonthSummary, MonthlyReport, NewTransaction,
  ReceiptScan, Transaction, TransactionFilters, User, Wallet,
} from '@/types'
import { download, http, json } from './client'

/** Photos go up with an extension matching their type (WebP, or JPEG from Safari). */
const photoName = (photo: Blob, base: string) => `${base}.${photo.type === 'image/webp' ? 'webp' : 'jpg'}`

export const api = {
  // Sign-in is the one thing done with supabase-js directly; the session's token then goes to FastAPI on every call.
  auth: {
    signIn: async (email: string, password: string): Promise<User> => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(authMessage(error))
      return toUser(data.user)
    },
    /** null: the account exists but the email link must be opened before signing in. */
    signUp: async (name: string, email: string, password: string): Promise<User | null> => {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { name }, emailRedirectTo: `${location.origin}/sign-in` },
      })
      if (error) throw new Error(authMessage(error))
      return data.session && data.user ? toUser(data.user) : null
    },
    checkEmail: (email: string) => http<{ exists: boolean }>('/auth/check-email', { query: { email } }),
    resetPassword: async (email: string): Promise<void> => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/sign-in?mode=reset`,
      })
      if (error) throw new Error(authMessage(error))
    },
    resendSignUp: async (email: string): Promise<void> => {
      const { error } = await supabase.auth.resend({ type: 'signup', email })
      if (error) throw new Error(authMessage(error))
    },
    updatePassword: async (password: string): Promise<User> => {
      const { data, error } = await supabase.auth.updateUser({ password })
      if (error || !data.user) throw new Error(error ? authMessage(error) : "Couldn't update your password.")
      return toUser(data.user)
    },
    updateUser: async (name: string): Promise<User> => {
      const { data, error } = await supabase.auth.updateUser({ data: { name } })
      if (error || !data.user) throw new Error(error ? authMessage(error) : "Couldn't update your profile.")
      return toUser(data.user)
    },
    signOut: async () => { await supabase.auth.signOut(); return null },
  },
  wallets: {
    list: () => http<Wallet[]>('/wallets'),
    create: (w: Pick<Wallet, 'name' | 'type' | 'balance'>) => http<Wallet>('/wallets', json('POST', w)),
    update: (id: string, patch: Partial<Pick<Wallet, 'name' | 'type' | 'balance' | 'archived'>>) => http<Wallet>(`/wallets/${id}`, json('PATCH', patch)),
  },
  categories: {
    list: () => http<Category[]>('/categories'),
    create: (c: Omit<Category, 'id'>) => http<Category>('/categories', json('POST', c)),
    update: (id: string, patch: Partial<Pick<Category, 'name' | 'icon'>>) => http<Category>(`/categories/${id}`, json('PATCH', patch)),
    remove: (id: string) => http<null>(`/categories/${id}`, { method: 'DELETE' }),
  },
  transactions: {
    list: (f: TransactionFilters = {}) => http<Transaction[]>('/transactions', { query: { ...f } }),
    get: (id: string) => http<Transaction>(`/transactions/${id}`),
    create: (t: NewTransaction) => http<Transaction>('/transactions', json('POST', t)),
    update: (id: string, patch: Partial<NewTransaction>) => http<Transaction>(`/transactions/${id}`, json('PATCH', patch)),
    remove: (id: string) => http<null>(`/transactions/${id}`, { method: 'DELETE' }),
    /** Attach the scanned photo (the shrinkPhoto copy) once the transaction is saved. Max 1 MB. */
    uploadReceipt: (id: string, photo: Blob) => {
      const body = new FormData()
      body.append('image', photo, photoName(photo, id))
      return http<null>(`/transactions/${id}/receipt`, { method: 'POST', body })
    },
    /** CSV of the filtered list, built by the backend. */
    exportCsv: (f: TransactionFilters) => download('/transactions/export.csv', { ...f }, `anttipid-${f.month ?? 'all'}.csv`),
  },
  budgets: {
    list: (month: string) => http<BudgetStatus[]>('/budgets', { query: { month } }),
    save: (b: Omit<Budget, 'id'> & { id?: string }) =>
      b.id ? http<null>(`/budgets/${b.id}`, json('PUT', b)) : http<null>('/budgets', json('POST', b)),
    remove: (id: string) => http<null>(`/budgets/${id}`, { method: 'DELETE' }),
  },
  reports: {
    summary: (month: string) => http<MonthSummary>('/reports/summary', { query: { month } }),
    monthly: (month: string) => http<MonthlyReport>('/reports/monthly', { query: { month } }),
  },
  receipts: {
    // Expects a photo already shrunk with shrinkPhoto (the scan panel reuses it for the preview and the upload).
    scan: (photo: Blob, signal?: AbortSignal) => {
      const body = new FormData()
      body.append('image', photo, photoName(photo, 'receipt'))
      return http<ReceiptScan>('/receipts/scan', { method: 'POST', body, signal })
    },
  },
}
