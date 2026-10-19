// The swipeable hero on Home. Each slide answers a question the rest of Home doesn't.
import { useRef, useState, type ReactNode } from 'react'
import { HeroCard } from '@/components/hero-card'
import { Badge } from '@/components/ui/badge'
import { CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { currentMonth, isoDate, money, monthLabel, shiftMonth } from '@/lib/format'
import { sumOf } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { MonthSummary, Transaction } from '@/types'

const GAP = 12

/** Native scroll-snap carousel: swipe on touch, scroll on trackpads, dots for everyone else. */
export function Carousel({ label, slides }: { label: string; slides: { title: string; content: ReactNode }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const slideWidth = () => ((ref.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1) + GAP

  function go(i: number) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollTo({ left: i * slideWidth(), behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <section aria-roledescription="carousel" aria-label={label} className="grid grid-cols-1 gap-1">
      <div
        ref={ref}
        onScroll={() => setIndex(Math.round((ref.current?.scrollLeft ?? 0) / slideWidth()))}
        // Bleeds to the screen edge on phones so the next card peeks in from the side.
        // contain-paint: without it, mobile Chrome widens the whole page to fit the off-screen slides.
        className="-mx-4 flex contain-paint snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4 md:mx-0 md:scroll-px-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ gap: GAP }}
      >
        {slides.map((s, i) => (
          <div
            key={s.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}: ${s.title}`}
            // A sliver of the next card shows on phones so it reads as swipeable.
            className="w-[88%] shrink-0 snap-start md:w-full [&>*]:h-full"
          >
            {s.content}
          </div>
        ))}
      </div>
      <div className="flex justify-center">
        {slides.map((s, i) => (
          <button
            key={s.title}
            type="button"
            aria-label={`Show ${s.title}`}
            aria-current={i === index}
            onClick={() => go(i)}
            className="group flex h-6 items-center px-1 focus-visible:outline-none"
          >
            <span className={cn(
              'block h-1.5 w-1.5 rounded-full bg-primary/25 transition-all group-focus-visible:ring-2 group-focus-visible:ring-ring',
              i === index && 'w-5 bg-primary',
            )} />
          </button>
        ))}
      </div>
    </section>
  )
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
type Period = 'week' | 'month'

/**
 * Spending per day for this week (Monday start) or this month, against the same days of the
 * previous week or month. Week is the default view.
 */
export function SpendingSlide({ transactions }: { transactions?: Transaction[] }) {
  const [today] = useState(() => new Date())
  const [period, setPeriod] = useState<Period>('week')
  if (!transactions) return <Skeleton className="h-64 w-full rounded-xl" />

  const spentOn = (d: Date) => {
    const date = isoDate(d)
    return sumOf(transactions.filter((t) => t.date === date), 'expense')
  }
  const shifted = (days: number, months = 0) => new Date(today.getFullYear(), today.getMonth() + months, today.getDate() + days)

  // One bar per day (week view) or per week (month view). Periods still ahead are null and drawn faint.
  let bars: { label: string; tick: string; spent: number | null }[]
  let previous = 0
  if (period === 'week') {
    const todayIdx = (today.getDay() + 6) % 7
    bars = WEEKDAYS.map((name, i) => ({ label: name, tick: name.slice(0, 1), spent: i <= todayIdx ? spentOn(shifted(i - todayIdx)) : null }))
    for (let i = 0; i <= todayIdx; i++) previous += spentOn(shifted(i - todayIdx - 7))
  } else {
    const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const monthName = monthLabel(currentMonth(), 'short')
    // One bar per week of the month: days 1–7, 8–14, 15–21, 22–28, 29 to the end.
    const dayTotal = (d: number) => spentOn(new Date(today.getFullYear(), today.getMonth(), d))
    bars = []
    for (let start = 1; start <= days; start += 7) {
      const end = Math.min(start + 6, days)
      const range = start === end ? String(start) : `${start}–${end}`
      let spent: number | null = null
      for (let d = start; d <= Math.min(end, today.getDate()); d++) spent = (spent ?? 0) + dayTotal(d)
      bars.push({ label: `${monthName} ${range}`, tick: range, spent })
    }
    for (let i = 1; i <= today.getDate(); i++) previous += spentOn(new Date(today.getFullYear(), today.getMonth() - 1, i))
  }

  const total = bars.reduce((s, d) => s + (d.spent ?? 0), 0)
  const diff = total - previous
  const max = Math.max(1, ...bars.map((d) => d.spent ?? 0))
  const biggest = bars.reduce((a, b) => ((b.spent ?? 0) > (a.spent ?? 0) ? b : a))
  const todayBar = bars.findLastIndex((d) => d.spent !== null)
  const lastPeriod = period === 'week' ? 'last week' : 'last month'

  return (
    <HeroCard>
      <CardHeader>
        <CardDescription>Spent this {period}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{money(total, { whole: true })}</CardTitle>
        <CardAction>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            {/* Compact on purpose: overrides the 36px tab rule so the switch stays small in the card corner. */}
            <TabsList aria-label="Spending period" className="h-7! p-0.5">
              <TabsTrigger value="week" className="min-h-0! px-2 text-xs">Week</TabsTrigger>
              <TabsTrigger value="month" className="min-h-0! px-2 text-xs">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="flex h-24 items-end gap-2" aria-label={period === 'week' ? 'Spending per day this week' : 'Spending per week this month'}>
          {bars.map((d, i) => (
            <li key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="sr-only">{d.label}: {d.spent === null ? 'not yet' : money(d.spent, { whole: true })}</span>
              <span
                aria-hidden
                className={cn('w-full rounded-sm', d.spent === null ? 'bg-primary-foreground/10' : 'bg-sidebar-primary')}
                style={{ height: `${Math.max(6, ((d.spent ?? 0) / max) * 100)}%` }}
              />
              <span aria-hidden className={cn('h-4 text-xs whitespace-nowrap', i === todayBar ? 'font-semibold' : 'opacity-70')}>
                {d.tick}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 text-sm">
        <p className="font-medium tabular-nums">
          {diff <= 0 ? `${money(-diff, { whole: true })} less` : `${money(diff, { whole: true })} more`} than the same days {lastPeriod} ({money(previous, { whole: true })}).
        </p>
        <p className="text-muted-foreground">
          {biggest.spent ? `Biggest ${period === 'week' ? 'day' : 'week'} so far: ${biggest.label}, ${money(biggest.spent, { whole: true })}` : `Nothing spent yet this ${period}.`}
        </p>
      </CardFooter>
    </HeroCard>
  )
}

const BILL_CATEGORIES = ['bills', 'load']

/**
 * Bills paid last month that haven't shown up yet this month, expected on the same day of the month.
 * ponytail: matches by exact title; switch to the recurring-bill model once it exists.
 */
export function BillsSlide({ transactions, summary }: { transactions?: Transaction[]; summary?: MonthSummary }) {
  const [today] = useState(() => new Date())
  if (!transactions || !summary) return <Skeleton className="h-64 w-full rounded-xl" />
  const thisMonth = currentMonth()
  const lastMonth = shiftMonth(thisMonth, -1)
  const isBill = (t: Transaction) => t.kind === 'expense' && BILL_CATEGORIES.includes(t.categoryId ?? '')
  const paidThisMonth = new Set(transactions.filter((t) => isBill(t) && t.date.startsWith(thisMonth)).map((t) => t.title))
  const upcoming = transactions
    .filter((t) => isBill(t) && t.date.startsWith(lastMonth) && !paidThisMonth.has(t.title))
    .map((t) => ({ title: t.title, amount: t.amount, day: Math.min(Number(t.date.slice(8)), summary.daysInMonth) }))
    .filter((b, i, all) => all.findIndex((x) => x.title === b.title) === i)
    .sort((a, b) => a.day - b.day)
  const total = upcoming.reduce((s, b) => s + b.amount, 0)
  const monthName = monthLabel(thisMonth, 'short')
  const leftAfter = summary.budget ? summary.budget - summary.spent - total : null

  return (
    <HeroCard>
      <CardHeader>
        <CardDescription>Bills still coming this month</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{upcoming.length ? money(total, { whole: true }) : 'All paid'}</CardTitle>
        {upcoming.length > 0 && <CardAction><Badge variant="secondary">{upcoming.length} {upcoming.length === 1 ? 'bill' : 'bills'}</Badge></CardAction>}
      </CardHeader>
      <CardContent>
        {upcoming.length ? (
          <ul className="divide-y divide-primary-foreground/15 text-sm">
            {upcoming.slice(0, 3).map((b) => (
              <li key={b.title} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{b.title}</span>
                  <span className="text-muted-foreground">Around {monthName} {b.day}{b.day < today.getDate() ? ', overdue' : ''}</span>
                </span>
                <span className="font-medium tabular-nums">{money(b.amount, { whole: true })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Every bill you paid last month is already paid this month.</p>
        )}
      </CardContent>
      {leftAfter !== null && upcoming.length > 0 && (
        <CardFooter className="text-sm">
          <p className="font-medium tabular-nums">
            {leftAfter >= 0 ? `${money(leftAfter, { whole: true })} left to spend once these are paid.` : `These put you ${money(-leftAfter, { whole: true })} over budget.`}
          </p>
        </CardFooter>
      )}
    </HeroCard>
  )
}
