// The swipeable hero on Home. Each slide answers a question the rest of Home doesn't.
import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useRefData } from '@/app-state'
import { HeroCard } from '@/components/hero-card'
import { CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { CategoryBreakdown } from '@/components/report-details'
import { ResponsivePanel } from '@/components/responsive-panel'
import { LoadingHero } from '@/components/states'
import { TransactionItem } from '@/components/transaction-item'
import { ItemGroup } from '@/components/ui/item'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { currentMonth, dayLabel, isoDate, money, monthLabel } from '@/lib/format'
import { sumOf } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types'

const GAP = 8

/** Native scroll-snap carousel: swipe on touch, scroll on trackpads, dots for everyone else. */
export function Carousel({ label, slides }: { label: string; slides: { title: string; content: ReactNode }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const slideWidth = () => ((ref.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1) + GAP

  return (
    <section aria-roledescription="carousel" aria-label={label} className="grid grid-cols-1 gap-1">
      <div
        ref={ref}
        onScroll={() => setIndex(Math.round((ref.current?.scrollLeft ?? 0) / slideWidth()))}
        // Bleeds to the screen edge on phones so the next card peeks in from the side.
        // contain-paint: without it, mobile Chrome widens the whole page to fit the off-screen slides.
        // motion-safe:scroll-smooth: the dots glide between slides, or jump when reduced motion is on.
        // The clip hides the left gutter: the gap is narrower than it, so a slide snapped to the gutter would
        // otherwise leave the edge of the one before it showing.
        className="-mx-4 flex contain-paint motion-safe:scroll-smooth snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4 [clip-path:inset(0_0_0_1rem)] md:mx-0 md:scroll-px-0 md:px-0 md:[clip-path:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ gap: GAP }}
      >
        {slides.map((s, i) => (
          <div
            key={s.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}: ${s.title}`}
            // A sliver of the next card shows on phones so it reads as swipeable: a fixed 16px (the .5rem it's short
            // of the row, plus the 16px gutter, minus the 8px gap), not a share of the width, so it doesn't widen
            // into a second card on bigger phones. The last slide has nothing to peek at and takes the full row,
            // so it can snap to the gutter like the others instead of stopping short of it.
            className="w-[calc(100%-0.5rem)] shrink-0 snap-start last:w-full md:w-full [&>*]:h-full"
          >
            {s.content}
          </div>
        ))}
      </div>
      {/* One slide: nothing to page through, so no dots. */}
      <div className={cn('flex justify-center', slides.length < 2 && 'hidden')}>
        {slides.map((s, i) => (
          <button
            key={s.title}
            type="button"
            aria-label={`Show ${s.title}`}
            aria-current={i === index}
            onClick={() => ref.current?.scrollTo({ left: i * slideWidth() })}
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
  const [opened, setOpened] = useState<{ title: string; from: string; to: string } | null>(null)
  if (!transactions) return <LoadingHero />

  const spentOn = (d: Date) => {
    const date = isoDate(d)
    return sumOf(transactions.filter((t) => t.date === date), 'expense')
  }
  const shifted = (days: number, months = 0) => new Date(today.getFullYear(), today.getMonth() + months, today.getDate() + days)

  // One bar per day (week view) or per week (month view). Periods still ahead are null; they and periods with nothing spent are drawn faint.
  // from/to: the dates a bar covers, for its breakdown panel.
  let bars: { label: string; tick: string; spent: number | null; from: string; to: string }[]
  let previous = 0
  if (period === 'week') {
    const todayIdx = (today.getDay() + 6) % 7
    bars = WEEKDAYS.map((name, i) => {
      const date = isoDate(shifted(i - todayIdx))
      return { label: name, tick: name.slice(0, 1), spent: i <= todayIdx ? spentOn(shifted(i - todayIdx)) : null, from: date, to: date }
    })
    for (let i = 0; i <= todayIdx; i++) previous += spentOn(shifted(i - todayIdx - 7))
  } else {
    const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const monthName = monthLabel(currentMonth(), 'short')
    // One bar per week of the month: days 1–7, 8–14, 15–21, 22–28, 29 to the end.
    const dayOf = (d: number) => new Date(today.getFullYear(), today.getMonth(), d)
    const dayTotal = (d: number) => spentOn(dayOf(d))
    bars = []
    for (let start = 1; start <= days; start += 7) {
      const end = Math.min(start + 6, days)
      const range = start === end ? String(start) : `${start}–${end}`
      let spent: number | null = null
      for (let d = start; d <= Math.min(end, today.getDate()); d++) spent = (spent ?? 0) + dayTotal(d)
      bars.push({ label: `${monthName} ${range}`, tick: range, spent, from: isoDate(dayOf(start)), to: isoDate(dayOf(end)) })
    }
    for (let i = 1; i <= today.getDate(); i++) previous += spentOn(new Date(today.getFullYear(), today.getMonth() - 1, i))
  }

  const total = bars.reduce((s, d) => s + (d.spent ?? 0), 0)
  const diff = total - previous
  const max = Math.max(1, ...bars.map((d) => d.spent ?? 0))
  const biggest = bars.reduce((a, b) => ((b.spent ?? 0) > (a.spent ?? 0) ? b : a))
  const todayBar = bars.findLastIndex((d) => d.spent !== null)
  const lastPeriod = period === 'week' ? 'last week' : 'last month'
  const unit = period === 'week' ? 'day' : 'week'

  return (
    <HeroCard>
      <CardHeader>
        <CardDescription>Spent this {period}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{money(total, { whole: true })}</CardTitle>
        <CardAction>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            {/* Compact on purpose: overrides the 36px tab rule so the switch stays small in the card corner. */}
            <TabsList aria-label="Spending period" className="h-7! p-0.5">
              <TabsTrigger value="week" className="px-2 text-xs">Week</TabsTrigger>
              <TabsTrigger value="month" className="px-2 text-xs">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent>
        {/* pt-5 keeps room above the tallest bar for its amount. */}
        <ol className="flex h-28 items-end gap-2 pt-5" aria-label={period === 'week' ? 'Spending per day this week' : 'Spending per week this month'}>
          {bars.map((d, i) => (
            <li key={d.label} className="h-full min-w-0 flex-1">
              {/* A bar with spending opens what it was spent on. */}
              <button
                type="button"
                disabled={!d.spent}
                onClick={() => setOpened({ title: d.from === d.to ? dayLabel(d.from) : d.label, from: d.from, to: d.to })}
                className="flex h-full w-full flex-col items-center justify-end gap-1.5 rounded-sm focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none"
              >
                <span className="sr-only">{d.label}: {d.spent === null ? 'not yet' : money(d.spent, { whole: true })}{d.spent ? '. Show breakdown' : ''}</span>
                {/* Each bar's amount sits just above it, compact (₱1.2K) to fit seven across a phone. */}
                <span
                  aria-hidden
                  className={cn('relative w-full rounded-sm', d.spent ? 'bg-sidebar-primary' : 'bg-primary-foreground/10')}
                  style={{ height: `${Math.max(6, ((d.spent ?? 0) / max) * 100)}%` }}
                >
                  {!!d.spent && (
                    <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] whitespace-nowrap tabular-nums opacity-80">
                      {money(d.spent, { compact: true })}
                    </span>
                  )}
                </span>
                <span aria-hidden className={cn('h-4 text-xs whitespace-nowrap', i === todayBar ? 'font-semibold' : 'opacity-70')}>
                  {d.tick}
                </span>
              </button>
            </li>
          ))}
        </ol>
        {opened && <SpendingDetail {...opened} transactions={transactions} onClose={() => setOpened(null)} />}
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 text-sm">
        {/* Nothing spent the same days last period (a new user, say): nothing to compare against. Equal: no "₱0 less". */}
        {previous > 0 && (
          <p className="font-medium tabular-nums">
            {Math.round(diff) === 0 ? 'Same as' : `${money(Math.abs(diff), { whole: true })} ${diff < 0 ? 'less' : 'more'} than`} the same days {lastPeriod} ({money(previous, { whole: true })}).
          </p>
        )}
        <p className="text-muted-foreground">
          {/* The bars are buttons; say so, in the words Reports uses for its own chart. */}
          {biggest.spent
            ? `Biggest ${unit} so far: ${biggest.label}, ${money(biggest.spent, { whole: true })}. Tap a ${unit} to see what you spent.`
            : `Nothing spent yet this ${period}.`}
        </p>
      </CardFooter>
    </HeroCard>
  )
}

/**
 * What one bar's spending went to: by category, then each expense. Home already holds the transactions, so nothing
 * loads. When every category has a single expense the two lists would say the same thing, so only the expenses show.
 */
function SpendingDetail({ title, from, to, transactions, onClose }: { title: string; from: string; to: string; transactions: Transaction[]; onClose: () => void }) {
  const expenses = transactions.filter((t) => t.kind === 'expense' && t.date >= from && t.date <= to)
  const byCategory = [...Map.groupBy(expenses, (t) => t.categoryId ?? '')]
    .map(([categoryId, list]) => ({ categoryId, total: sumOf(list, 'expense') }))
    .sort((a, b) => b.total - a.total)
  // -mx-3 on both lists: the same inset CategoryBreakdown's rows use, so icons and amounts line up down the panel.
  const list = <ItemGroup className="-mx-3">{expenses.map((t) => <TransactionItem key={t.id} t={t} />)}</ItemGroup>
  return (
    <ResponsivePanel onClose={onClose} title={title} description={`${money(sumOf(expenses, 'expense'))} spent`}>
      {byCategory.length < expenses.length ? (
        <div className="grid gap-6 pb-4">
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">By category</h3>
            <CategoryBreakdown items={byCategory} />
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Each expense</h3>
            {list}
          </div>
        </div>
      ) : (
        <div className="pb-4">{list}</div>
      )}
    </ResponsivePanel>
  )
}

/** This month's top spending categories, biggest first, each with its share of everything spent. Links to Reports. */
export function CategoriesSlide({ transactions }: { transactions?: Transaction[] }) {
  const { category } = useRefData()
  if (!transactions) return <LoadingHero />
  const month = currentMonth()
  const expenses = transactions.filter((t) => t.kind === 'expense' && t.date.startsWith(month))
  const total = sumOf(expenses, 'expense')
  const top = [...Map.groupBy(expenses, (t) => t.categoryId ?? '')]
    .map(([id, list]) => ({ id, spent: sumOf(list, 'expense') }))
    .sort((a, b) => b.spent - a.spent)

  return (
    <HeroCard>
      <CardHeader>
        <CardDescription>Where it went this month</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{money(total, { whole: true })}</CardTitle>
      </CardHeader>
      <CardContent>
        {top.length ? (
          <ul className="grid gap-3 text-sm">
            {top.slice(0, 3).map((c) => {
              const share = Math.round((c.spent / total) * 100)
              return (
                <li key={c.id} className="grid gap-1.5">
                  <span className="flex justify-between gap-3">
                    <span className="truncate font-medium">{category(c.id)?.name ?? 'Other'}</span>
                    <span className="tabular-nums">{money(c.spent, { whole: true })} ({share}%)</span>
                  </span>
                  <span aria-hidden className="h-1.5 rounded-full bg-primary-foreground/15">
                    <span className="block h-full rounded-full bg-sidebar-primary" style={{ width: `${share}%` }} />
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing spent yet this month. Your top categories show here once you add expenses.</p>
        )}
      </CardContent>
      {/* Empty: Reports would be just as empty. */}
      {top.length > 0 && (
        <CardFooter className="text-sm">
          <Link to="/reports" className="font-medium underline underline-offset-4">
            {top.length > 3 ? `See all ${top.length} categories in Reports` : 'See the breakdown in Reports'}
          </Link>
        </CardFooter>
      )}
    </HeroCard>
  )
}
