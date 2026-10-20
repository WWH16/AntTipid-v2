// App-wide state: who is signed in, and the two sheets any screen can open (add/edit, transaction details).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { currentMonth } from '@/lib/format'
import { supabase, toUser } from '@/lib/supabase'
import type { Transaction, TransactionKind, User } from '@/types'

type AddRequest = { kind?: TransactionKind; scan?: boolean; edit?: Transaction }

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
const KEY = 'anttipid-user' // mock mode only; real sessions are kept by supabase-js

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (supabase) return null
    try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') } catch { return null }
  })
  const [ready, setReady] = useState(!supabase)
  const [add, setAdd] = useState<AddRequest | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Real mode: the Supabase session is the source of truth. This fires once with the saved session
  // (INITIAL_SESSION), then on every sign-in, sign-out and token refresh.
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toUser(session.user) : null)
      setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const value: AppState = {
    user,
    ready,
    // Real mode: onAuthStateChange already set the user.
    signIn: (u) => { if (!supabase) { setUser(u); try { sessionStorage.setItem(KEY, JSON.stringify(u)) } catch { /* private mode */ } } },
    signOut: () => {
      setUser(null)
      setAdd(null)
      setDetailId(null)
      if (supabase) void api.auth.signOut()
      else try { sessionStorage.removeItem(KEY) } catch { /* private mode */ }
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

/** The month a screen is showing, kept in the URL (?month=2026-10) so back/forward and links keep it. */
export function useMonth() {
  const [params, setParams] = useSearchParams()
  const month = params.get('month') ?? currentMonth()
  const setMonth = (m: string) => setParams((p) => { p.set('month', m); return p }, { replace: true })
  return [month, setMonth] as const
}
