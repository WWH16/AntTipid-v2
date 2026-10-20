// Minimal data hook: load on mount / when the key changes, reload everything after any mutation.
// Calls with the same key share one request, and a screen opened again shows its last data while it reloads.
// ponytail: cache never evicts (a few KB per key); switch to TanStack Query if that or retries start to matter.
import { useEffect, useState, useSyncExternalStore } from 'react'

let version = 0
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))

/** Last loaded data per key, and the request for the current version (shared by every caller of that key). */
const cache = new Map<string, { version: number; request: Promise<unknown>; data?: unknown }>()

function fetchShared(key: string, load: () => Promise<unknown>) {
  const hit = cache.get(key)
  if (hit?.version === version) return hit.request
  const entry = { version, data: hit?.data, request: load() }
  entry.request.then(
    (data) => { entry.data = data },
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

export function useQuery<T>(key: string, load: () => Promise<T>) {
  const v = useSyncExternalStore(subscribe, () => version)
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
  if (state.key === key) return { data: state.data, error: state.error, loading: false }
  const cached = cache.get(key)?.data as T | undefined
  return { data: cached, error: undefined, loading: cached === undefined }
}
