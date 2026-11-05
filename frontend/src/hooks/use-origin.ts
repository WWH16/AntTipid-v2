import { useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * For a page outside the app shell that a screen opens with state={{ from: pathname + search }}.
 * Returns that screen's address, or undefined when opened directly. Read once on arrival, because a Contents click
 * starts a history entry with no state. Routes keep the window's scroll, so the page opens at the top and puts the
 * screen's scroll back on the way out.
 * ponytail: Privacy's empty Suspense fallback collapses the page on first open, so that one return lands at the top.
 * Give the fallback height if it matters.
 */
export function useOrigin() {
  const { state } = useLocation()
  const [origin] = useState(() => ({ from: state?.from as string | undefined, scroll: window.scrollY }))
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    return () => window.scrollTo(0, origin.scroll)
  }, [origin])
  return origin.from
}
