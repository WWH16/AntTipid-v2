// Minimal data hook: load on mount / when the key changes, reload everything after any mutation.
// Calls with the same key share one request, and a screen opened again shows its last data while it reloads.
// The overview data is also saved per user in localStorage, so reopening the app shows it at once and refreshes.
// ponytail: cache never evicts (a few KB per key); switch to TanStack Query if that or retries start to matter.
import { useEffect, useState, useSyncExternalStore } from 'react'

let version = 0
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))

/** Last loaded data per key, and the request for the current version (shared by every caller of that key). */
const cache = new Map<string, { version: number; request?: Promise<unknown>; data?: unknown }>()

// Saved across visits: lists and totals only, including a month's unfiltered Activity list. Not search or filter
// results (one entry per keystroke) and not single transactions (their receipt link is a short-lived signed URL).
const SAVED = /^(wallets|categories|months$|recent:|summary:|budgets:|report:|tx:\{"month":"[^"]+"\}$)/
const STORE = 'anttipid-cache-v1:'
let storeKey: string | null = null

function save() {
  if (!storeKey) return
  const saved = Object.fromEntries([...cache].filter(([k, e]) => SAVED.test(k) && e.data !== undefined).map(([k, e]) => [k, e.data]))
  try { localStorage.setItem(storeKey, JSON.stringify(saved)) } catch { /* full or private mode: memory cache still works */ }
}

/** Call when the signed-in user changes. Loads that user's saved data (shown until it reloads); with no user,
 *  forgets everything in memory and deletes every saved copy, so nothing is left on a shared device. */
export function setCacheUser(userId: string | null) {
  // No user always wipes: a session that expired while the app was closed signs out on a fresh page load.
  if (userId && storeKey === STORE + userId) return
  cache.clear()
  storeKey = userId && STORE + userId
  try {
    if (!userId) {
      Object.keys(localStorage).filter((k) => k.startsWith(STORE)).forEach((k) => localStorage.removeItem(k))
      return
    }
    // Version -1: shown at once, but always fetched again.
    const saved = JSON.parse(localStorage.getItem(STORE + userId) ?? '{}') as Record<string, unknown>
    for (const [k, data] of Object.entries(saved)) cache.set(k, { version: -1, data })
  } catch { /* unreadable storage: start empty */ }
}

function fetchShared(key: string, load: () => Promise<unknown>) {
  const hit = cache.get(key)
  if (hit?.version === version && hit.request) return hit.request
  const entry = { version, data: hit?.data, request: load() }
  entry.request.then(
    (data) => { entry.data = data; save() },
    // A failed load isn't kept: the next screen that asks tries again.
    () => { entry.version = -1 },
  )
  cache.set(key, entry)
  return entry.request
}

/** Call after a create/update/delete so every screen reloads its data. */
export function invalidate() {
  version++
  listeners.forEach((l) => l())
}

/** Reload everything on screen, like invalidate, and resolve once those reloads have settled. */
export async function refresh() {
  invalidate()
  // Screens start their reloads in an effect after this render; give them a moment to register.
  await new Promise((r) => setTimeout(r, 50))
  await Promise.allSettled([...cache.values()].filter((e) => e.version === version && e.request).map((e) => e.request))
}

/** Show a change in a loaded list at once instead of after the reload. The reload still replaces it. */
export function setCached<T>(key: string, update: (data: T) => T) {
  const entry = cache.get(key)
  if (entry?.data === undefined) return
  entry.data = update(entry.data as T)
  listeners.forEach((l) => l())
}

export function useQuery<T>(key: string, load: () => Promise<T>) {
  const v = useSyncExternalStore(subscribe, () => version)
  // Last loaded data for this key, plus any setCached change made since (re-renders on those without reloading).
  const cached = useSyncExternalStore(subscribe, () => cache.get(key)?.data) as T | undefined
  const [state, setState] = useState<{ data?: T; error?: Error; key?: string }>({})
  useEffect(() => {
    let live = true
    ;(fetchShared(key, load) as Promise<T>).then(
      (data) => live && setState({ data, key }),
      (error: Error) => live && setState((s) => ({ ...s, error, key })),
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v])
  if (state.key === key) return { data: cached ?? state.data, error: state.error, loading: false }
  return { data: cached, error: undefined, loading: cached === undefined }
}
