import type { ReactNode } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currentMonth, monthLabel, shiftMonth } from '@/lib/format'

/**
 * Month picker that stays pinned to the top while the page scrolls, so the month being viewed
 * (and anything passed as children, like totals) is always in sight.
 */
// Arrows stay 32px on phones (the touch rule would make them 44px and the pill bulky); 36px from md up.
const ARROW = 'size-8! min-h-0! min-w-0! rounded-full md:size-9!'

export function MonthSwitcher({ month, onChange, children }: { month: string; onChange: (m: string) => void; children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-background px-4 py-2 md:-mx-6 md:px-6">
      {/* One raised pill: previous, the month, next. */}
      <div className="flex items-center rounded-full border bg-card p-0.5 shadow-sm md:p-1">
        <Button variant="ghost" size="icon" className={ARROW} aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
          <ChevronLeft />
        </Button>
        <span className="flex min-w-32 items-center justify-center gap-1.5 px-1 text-sm font-semibold md:min-w-36 md:gap-2" aria-live="polite">
          <CalendarDays className="size-4 text-primary" aria-hidden />
          {monthLabel(month)}
        </span>
        <Button variant="ghost" size="icon" className={ARROW} aria-label="Next month" disabled={month >= currentMonth()} onClick={() => onChange(shiftMonth(month, 1))}>
          <ChevronRight />
        </Button>
      </div>
      {children}
    </div>
  )
}
