import { useEffect, useRef, useState, type RefObject } from 'react'
import { Popover } from '@base-ui/react/popover'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { Button } from '@/components/ui/button'
import { currentMonth, money, monthLabel, shiftMonth } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MonthHistory } from '@/types'

// One size everywhere: the pill is 38px tall on phones and desktops alike (index.css pads touch targets to 44px).
const ARROW = 'size-8! rounded-full'

/**
 * Month picker that stays pinned to the top while the page scrolls, so the month being viewed
 * is always in sight. Arrows, a sideways swipe on the page
 * or ← → step one month; the month name opens a grid to jump straight to any month.
 * Months run from the first one with a transaction up to the current month.
 */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const now = currentMonth()
  const { data: history } = useQuery('months', api.reports.months)
  // Until the history loads, don't hold anyone back; with no transactions yet, there's only this month.
  const first = history ? (history.months[0]?.month ?? now) : undefined
  const trigger = useRef<HTMLButtonElement>(null)

  // At rest the bar sits on the page with no surface of its own. Once it sticks (top: -1px puts its top pixel
  // out of view), it gets a frosted background and a bottom border so content scrolling under it stays legible.
  const bar = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setStuck(e.intersectionRatio < 1), { threshold: 1 })
    io.observe(bar.current!)
    return () => io.disconnect()
  }, [])

  const go = (m: string) => {
    onChange(m)
    // The control just used is about to be disabled or hidden: keep keyboard focus on the month instead of losing it.
    if (m >= now || (first && m <= first)) trigger.current?.focus()
  }
  const step = (by: -1 | 1) => {
    const m = shiftMonth(month, by)
    if (by > 0 ? m <= now : !first || m >= first) go(m)
  }
  useStepGestures(step)

  return (
    <div
      ref={bar}
      className={cn(
        'sticky -top-px z-30 -mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-transparent px-4 py-2 transition-colors duration-200 md:-mx-6 md:px-6',
        stuck && 'border-border bg-background/80 backdrop-blur-md',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-full border bg-card p-0.5 shadow-sm">
          <Button variant="ghost" size="icon" className={ARROW} aria-label="Previous month" disabled={!!first && month <= first} onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <MonthPicker month={month} onChange={onChange} history={history} first={first} triggerRef={trigger} />
          <Button variant="ghost" size="icon" className={ARROW} aria-label="Next month" disabled={month >= now} onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </div>
        {month < now && (
          // Same height and outline as the month pill beside it, so it reads as a button.
          <Button variant="outline" className="h-9.5! rounded-full px-3 text-primary" onClick={() => go(now)}>
            This month
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * The month name as a button; opens a year of months with what was spent in each (red when over the monthly budget).
 * Months outside the range can't be picked.
 */
function MonthPicker({ month, onChange, history, first, triggerRef }: {
  month: string
  onChange: (m: string) => void
  history?: MonthHistory
  first?: string
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const now = currentMonth()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const totals = new Map(history?.months.map((m) => [m.month, m]))
  const budget = history?.budget ?? 0
  const firstYear = Number((first ?? month).slice(0, 4))

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        // Every time it opens, start on the year being viewed.
        if (o) setYear(Number(month.slice(0, 4)))
        setOpen(o)
      }}
    >
      <Popover.Trigger
        ref={triggerRef}
        render={
          <Button
            variant="ghost"
            // Fixed width (fits "Sep 2026" on phones, "September 2026" from sm up), so the arrows never move as the month
            // changes. Phones get the short name so the pill and "This month" fit side by side on a 360px screen.
            className="h-8! w-28 gap-1.5 rounded-full px-2 font-semibold sm:w-40"
          />
        }
      >
        <span aria-live="polite">
          <span className="sm:hidden">{monthLabel(month, 'short')} {month.slice(0, 4)}</span>
          <span className="hidden sm:inline">{monthLabel(month)}</span>
        </span>
        <ChevronDown className="size-3.5! text-muted-foreground" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="isolate z-50 outline-none" align="center" sideOffset={8} collisionPadding={16}>
          <Popover.Popup className="w-76 origin-(--transform-origin) rounded-xl bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex items-center justify-between pb-2">
              <Button variant="ghost" size="icon" className={ARROW} aria-label="Previous year" disabled={year <= firstYear} onClick={() => setYear((y) => y - 1)}>
                <ChevronLeft />
              </Button>
              <Popover.Title className="text-sm font-semibold tabular-nums" aria-live="polite">{year}</Popover.Title>
              <Button variant="ghost" size="icon" className={ARROW} aria-label="Next year" disabled={`${year + 1}-01` > now} onClick={() => setYear((y) => y + 1)}>
                <ChevronRight />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {months.map((m) => {
                const selected = m === month
                const spent = totals.get(m)?.spent ?? 0
                const over = budget > 0 && spent > budget
                const future = m > now
                const facts = [
                  monthLabel(m),
                  !future && (totals.has(m) ? `${money(spent)} spent` : 'no transactions'),
                  over && 'over budget',
                ]
                return (
                  <Button
                    key={m}
                    variant={selected ? 'default' : 'ghost'}
                    className={cn(
                      'h-12 flex-col gap-0 font-normal',
                      m === now && !selected && 'text-primary',
                      // Selected turns the cell green and its amount white, so over budget shows as a red ring instead.
                      selected && over && 'ring-2 ring-destructive ring-offset-2 ring-offset-popover',
                    )}
                    aria-label={facts.filter(Boolean).join(', ')}
                    aria-pressed={selected}
                    disabled={future || (!!first && m < first && m !== month)}
                    onClick={() => { onChange(m); setOpen(false) }}
                  >
                    <span className={cn('font-medium', (selected || m === now) && 'font-semibold')}>{monthLabel(m, 'short')}</span>
                    <span
                      className={cn(
                        'text-xs tabular-nums',
                        selected ? 'text-primary-foreground/85' : over ? 'font-medium text-destructive' : 'text-muted-foreground',
                        !totals.has(m) && !selected && 'opacity-50',
                      )}
                    >
                      {/* Future months haven't happened: blank, not the "—" of a month with nothing recorded.
                          Under ₱10K in full, so ₱4,990 against a ₱5,000 budget doesn't read as "₱5K". */}
                      {future ? ' ' : !totals.has(m) ? '—' : money(spent, spent < 10_000 ? { whole: true } : { compact: true })}
                    </span>
                  </Button>
                )
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

// Places that already use ← → or a sideways drag for themselves.
const OWNS_ARROWS = 'input, textarea, select, [contenteditable=true], [role=tablist], [role=radiogroup], [role=slider], [role=menu], [role=listbox], [role=grid], [role=toolbar], [role=dialog], .recharts-wrapper'

/** A sideways swipe on the page (touch) or ← → (keyboard, nothing focused that uses arrows) steps a month. */
function useStepGestures(step: (by: -1 | 1) => void) {
  const latest = useRef(step)
  useEffect(() => { latest.current = step })
  useEffect(() => {
    let start: { x: number; y: number; at: number; target: Element } | null = null
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      start = e.touches.length === 1 && e.target instanceof Element && mayStartSwipe(e.target, t.clientX)
        ? { x: t.clientX, y: t.clientY, at: e.timeStamp, target: e.target }
        : null
    }
    const onEnd = (e: TouchEvent) => {
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      // A quick, clearly sideways flick: finger left = next month, like turning a page.
      const flick = Math.abs(dx) >= 64 && Math.abs(dy) * 2 < Math.abs(dx) && e.timeStamp - start.at < 600
      if (flick && !ownsSwipe(start.target)) latest.current(dx < 0 ? 1 : -1)
      start = null
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.target instanceof Element && e.target.closest(OWNS_ARROWS)) return
      if (document.querySelector('[role=dialog]')) return
      latest.current(e.key === 'ArrowLeft' ? -1 : 1)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
}

/** Cheap checks only: this runs on every touch, before the page starts scrolling. */
function mayStartSwipe(target: Element, x: number) {
  // Screen edges belong to the browser's own back and forward swipe.
  return x >= 24 && x <= window.innerWidth - 24 && !!target.closest('#main') && !target.closest(OWNS_ARROWS)
}

/** Rows with their own swipe (touch-action: pan-y) and anything that scrolls sideways keep the gesture.
 *  Reads styles and layout, so it only runs once a touch has turned out to be a sideways flick. */
function ownsSwipe(target: Element) {
  // Charts: dragging across one reads its tooltip day by day, so a quick drag there isn't a page turn.
  if (target.closest('.recharts-wrapper')) return true
  for (let el: Element | null = target; el && el.id !== 'main'; el = el.parentElement) {
    const style = getComputedStyle(el)
    if (style.touchAction.includes('pan-y') && !style.touchAction.includes('pan-x')) return true
    if (/auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth) return true
  }
  return false
}
