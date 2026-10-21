import { useSyncExternalStore } from "react"

const QUERY = "(max-width: 767px)"

export function useIsMobile() {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(QUERY)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(QUERY).matches,
  )
}
