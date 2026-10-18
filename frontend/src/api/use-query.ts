// Minimal data hook: load on mount / when the key changes, reload everything after any mutation.
// ponytail: no cache or dedupe; switch to TanStack Query if screens start refetching the same data.
import { useEffect, useState, useSyncExternalStore } from 'react'

let version = 0
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))

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
    load().then(
      (data) => live && setState({ data, key }),
      (error: Error) => live && setState((s) => ({ ...s, error, key })),
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v])
  return { data: state.data, error: state.error, loading: state.key !== key }
}
