// App-wide state: who is signed in, and the two sheets any screen can open (add/edit, transaction details).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/endpoints'
import { setCacheUser, useQuery } from '@/api/use-query'
import { currentMonth } from '@/lib/format'
import { supabase, toUser } from '@/lib/supabase'
import type { Transaction, TransactionKind, User } from '@/types'

// copy: a new transaction prefilled from an old one ("Add again"), dated today.
type AddRequest = { kind?: TransactionKind; scan?: boolean; edit?: Transaction; copy?: Transaction; date?: string }

interface AppState {
  user: User | null
  /** False until the saved Supabase session has been read; don't redirect to sign-in before then. */
  ready: boolean
  signIn: (u: User) => void
  signOut: () => void
  add: AddRequest | null
  openAdd: (r?: AddRequest) => void
  closeAdd: () => void
  detailId: string | null
  openDetail: (id: string) => void
  closeDetail: () => void
}

const Ctx = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [add, setAdd] = useState<AddRequest | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  // The Supabase session is the source of truth. This fires once with the saved session
  // (INITIAL_SESSION), then on every sign-in, sign-out and token refresh.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Before setUser, so the first render after sign-in already has this user's saved data, never another's.
      setCacheUser(session?.user.id ?? null)
      setUser(session?.user ? toUser(session.user) : null)
      setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const value: AppState = {
    user,
    ready,
    // Updates state immediately, before onAuthStateChange catches up.
    signIn: setUser,
    signOut: () => {
      setCacheUser(null)
      setUser(null)
      setAdd(null)
      setDetailId(null)
      void api.auth.signOut()
    },
    add,
    openAdd: (r = {}) => { setDetailId(null); setAdd(r) },
    closeAdd: () => setAdd(null),
    detailId,
    openDetail: setDetailId,
    closeDetail: () => setDetailId(null),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside AppStateProvider')
  return v
}

/** Wallets and categories, needed by almost every screen to show names and icons. */
export function useRefData() {
  const wallets = useQuery('wallets', api.wallets.list)
  const categories = useQuery('categories', api.categories.list)
  const walletList = wallets.data ?? []
  const categoryList = categories.data ?? []
  return {
    wallets: walletList,
    categories: categoryList,
    loading: wallets.loading || categories.loading,
    wallet: (id?: string) => walletList.find((w) => w.id === id),
    category: (id?: string | null) => categoryList.find((c) => c.id === id),
  }
}

/** Pages with a month switcher; they all read the month from ?month. */
export const MONTH_PAGES = new Set(['/activity', '/budgets', '/reports'])

/** A link to one of the month pages on `month`, in the shape useMonth reads (no param for the current month). */
export function monthLink(path: string, month: string, more: Record<string, string> = {}) {
  const q = new URLSearchParams(month < currentMonth() ? { month, ...more } : more)
  return q.size ? `${path}?${q}` : path
}

/** The current month, checked again whenever the app comes back into view, so a new month is picked up on return. */
export function useCurrentMonth() {
  const [month, setMonth] = useState(currentMonth)
  useEffect(() => {
    const check = () => setMonth(currentMonth())
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])
  return month
}

/**
 * The month a screen is showing, kept in the URL (?month=2026-08) so back/forward and links keep it.
 * Only past months are written; no param means the current month, so an open tab rolls over with the calendar.
 * A malformed or future ?month falls back to the current month.
 */
export function useMonth() {
  const [params, setParams] = useSearchParams()
  const now = currentMonth()
  const raw = params.get('month')
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw < now ? raw : now
  const setMonth = (m: string) => setParams((p) => {
    if (m < currentMonth()) p.set('month', m)
    else p.delete('month')
    return p
  }, { replace: true })
  return [month, setMonth] as const
}
