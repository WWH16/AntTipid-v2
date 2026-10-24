import { useEffect, useRef } from 'react'

/**
 * The page's scrollbar on mouse screens: only the thumb, floating over the page's right edge, so no gutter strip
 * shows beside full-width sections. index.css hides the native bar for the same screens (phones keep their own
 * floating bar, and this one is hidden there). Wheel, keys and touch scroll the page as always; the thumb can be dragged.
 */
export function PageScrollbar() {
  const thumb = useRef<HTMLDivElement>(null)
  const dragStart = useRef({ y: 0, scroll: 0, ratio: 0 })

  useEffect(() => {
    const el = thumb.current!
    const root = document.documentElement
    const update = () => {
      const view = innerHeight
      const full = root.scrollHeight
      el.hidden = full <= view
      const h = Math.max(32, (view * view) / full)
      el.style.height = `${h}px`
      el.style.transform = `translateY(${(scrollY / (full - view)) * (view - h)}px)`
    }
    update()
    addEventListener('scroll', update, { passive: true })
    addEventListener('resize', update)
    // Page height changes without a scroll or resize (routes, loaded data, opened sections).
    const ro = new ResizeObserver(update)
    ro.observe(document.body)
    return () => {
      removeEventListener('scroll', update)
      removeEventListener('resize', update)
      ro.disconnect()
    }
  }, [])

  // Dragging moves the page by the same share of its height as the thumb moved along the screen. Pointer capture keeps
  // the moves coming off the thumb and ends by itself on release.
  return (
    <div
      ref={thumb}
      aria-hidden
      className="page-thumb"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        const ratio = (document.documentElement.scrollHeight - innerHeight) / (innerHeight - e.currentTarget.offsetHeight)
        dragStart.current = { y: e.clientY, scroll: scrollY, ratio }
      }}
      onPointerMove={(e) => {
        const s = dragStart.current
        if (e.currentTarget.hasPointerCapture(e.pointerId)) scrollTo({ top: s.scroll + (e.clientY - s.y) * s.ratio, behavior: 'instant' })
      }}
    />
  )
}
