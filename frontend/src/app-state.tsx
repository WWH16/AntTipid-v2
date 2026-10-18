// App-wide state: who is signed in, and the two sheets any screen can open (add/edit, transaction details).
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { currentMonth } from '@/lib/format'
import type { Transaction, TransactionKind, User } from '@/types'

type AddRequest = { kind?: TransactionKind; scan?: boolean; edit?: Transaction }

interface AppState {
  user: User | null
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
const KEY = 'anttipid-user'

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') } catch { return null }
  })
  const [add, setAdd] = useState<AddRequest | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const value: AppState = {
    user,
    signIn: (u) => { setUser(u); try { sessionStorage.setItem(KEY, JSON.stringify(u)) } catch { /* private mode */ } },
    signOut: () => { setUser(null); try { sessionStorage.removeItem(KEY) } catch { /* private mode */ } },
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
    wallet: (id?: string) => walletList.find((w) => w.id === id),
    category: (id?: string) => categoryList.find((c) => c.id === id),
  }
}

/** The month a screen is showing, kept in the URL (?month=2026-10) so back/forward and links keep it. */
export function useMonth() {
  const [params, setParams] = useSearchParams()
  const month = params.get('month') ?? currentMonth()
  const setMonth = (m: string) => setParams((p) => { p.set('month', m); return p }, { replace: true })
  return [month, setMonth] as const
}
