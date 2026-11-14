// App-wide state: who is signed in, and the two sheets any screen can open (add/edit, transaction details).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/endpoints'
import { invalidate, setCacheUser, useQuery } from '@/api/use-query'
import { currentMonth, watchDay } from '@/lib/format'
import { supabase, takeSessionEnded, toUser } from '@/lib/supabase'
import type { Transaction, TransactionKind, User } from '@/types'

// copy: a new transaction prefilled from an old one ("Add again"), dated today.
type AddRequest = { kind?: TransactionKind; scan?: boolean; edit?: Transaction; copy?: Transaction; date?: string }

interface AppState {
  user: User | null
  /** False until the saved Supabase session has been read; don't redirect to sign-in before then. */
  ready: boolean
  /** A sign-in elsewhere ended this browser's session. The sign-in page says so until the next sign-in. */
  sessionEnded: boolean
  /** A newer tab of this browser is showing the app; this one shows "Session expired" until it's reloaded. */
  tabLocked: boolean
  /** Make this the one tab showing the app, if it loaded signed in or signed in here and no newer tab took over. */
  claimTab: () => void
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

// Tabs of one browser share one session, so the server can't tell them apart. They tell each other instead: a tab that
// starts showing the app posts the time, and every other tab locks.
const tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('anttipid-tab')

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [tabLocked, setTabLocked] = useState(false)
  // at: when this tab last claimed the app. allowed: it may claim on its own, because it loaded signed in or signed in
  // here. A tab that only received another tab's sign-in never claims on its own, so it can't take the app back.
  // locked mirrors tabLocked, so claimTab can stay the same function across renders.
  const claim = useRef({ at: 0, allowed: false, locked: false })
  const [add, setAdd] = useState<AddRequest | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  // The Supabase session is the source of truth. This fires once with the saved session
  // (INITIAL_SESSION), then on every sign-in, sign-out and token refresh.
  useEffect(() => {
    let userId: string | null | undefined
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id ?? null
      if (event === 'INITIAL_SESSION' && id) claim.current.allowed = true
      if (!id) claim.current.allowed = false
      // Another tab signed out or switched accounts: close sheets still holding the old account's transaction.
      if (id !== userId) { setAdd(null); setDetailId(null) }
      // Signed out because a sign-in elsewhere ended the session: the sign-in page says why. Any sign-in clears it.
      if (id) setSessionEnded(false)
      else if (takeSessionEnded()) setSessionEnded(true)
      userId = id
      // Before setUser, so the first render after sign-in already has this user's saved data, never another's.
      setCacheUser(id)
      setUser(session?.user ? toUser(session.user) : null)
      setReady(true)
    })
    // Back on screen: ask Auth whether the session still exists, so a sign-in elsewhere shows here at once.
    // A session that's gone is dropped by auth-js, which signs this browser out.
    const recheck = () => { if (userId && document.visibilityState === 'visible') void supabase.auth.getUser() }
    document.addEventListener('visibilitychange', recheck)
    return () => {
      data.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [])

  // Another tab claimed the app at the same time or later than this one did: lock. When two tabs open together, the
  // later claim wins instead of both locking.
  useEffect(() => {
    const onClaim = (e: MessageEvent<number>) => {
      if (e.data < claim.current.at) return
      claim.current.locked = true
      setTabLocked(true)
    }
    tabs?.addEventListener('message', onClaim)
    return () => tabs?.removeEventListener('message', onClaim)
  }, [])

  // force: signing in here takes the app back even in a locked tab.
  const claimTab = useCallback((force = false) => {
    if (!force && (!claim.current.allowed || claim.current.locked)) return
    claim.current = { at: Date.now(), allowed: true, locked: false }
    tabs?.postMessage(claim.current.at)
    setTabLocked(false)
  }, [])

  const value: AppState = {
    user,
    ready,
    sessionEnded,
    tabLocked,
    claimTab,
    // Updates state immediately, before onAuthStateChange catches up. Signing in here makes this the tab showing the app.
    signIn: (u) => { setUser(u); claimTab(true) },
    signOut: () => {
      takeSessionEnded() // signing out on purpose is never "ended elsewhere"
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
    settled: wallets.settled && categories.settled,
    error: wallets.error ?? categories.error,
    wallet: (id?: string) => walletList.find((w) => w.id === id),
    category: (id?: string | null) => categoryList.find((c) => c.id === id),
  }
}

/** Pages with a month switcher; they all read the month from ?month. */
export const MONTH_PAGES = new Set(['/activity', '/budgets', '/reports'])

/** A link to one of the month pages on `month`, in the shape useMonth reads (no param for the current month). */
export function monthLink(path: string, month: string, more: Record<string, string> = {}) {
  const q = new URLSearchParams(month < currentMonth() ? { month, ...more } : more)
  return q.toString() ? `${path}?${q}` : path // not q.size: Safari only has it from 17
}

/** The current month. An app left open past midnight reloads every screen when it comes back into view, so the pace and
 *  daily amounts count from the new date; a new month also restarts the page (the app shell keys on this). */
export function useCurrentMonth() {
  const [month, setMonth] = useState(currentMonth)
  useEffect(() => watchDay((day) => { invalidate(); setMonth(day.slice(0, 7)) }), [])
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
  const month = raw && /^20\d{2}-(0[1-9]|1[0-2])$/.test(raw) && raw < now ? raw : now // the API's range, 2000 to 2099
  const setMonth = (m: string) => setParams((p) => {
    if (m < currentMonth()) p.set('month', m)
    else p.delete('month')
    return p
  }, { replace: true })
  return [month, setMonth] as const
}
