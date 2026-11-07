// Drill-down panels for the Reports charts: one day, one category, one month.
import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { monthLink, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { BudgetBadge } from '@/components/budget'
import { OVER_BAR, budgetPercent, budgetRemaining, budgetState, remainingOfLimit } from '@/lib/budget'
import { CategoryMedia } from '@/components/category-icon'
import { ResponsivePanel } from '@/components/responsive-panel'
import { LoadingItems } from '@/components/states'
import { TransactionItem } from '@/components/transaction-item'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemGroup } from '@/components/ui/item'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { dayIso, dayLabel, daysIn, money, monthLabel, shiftMonth, todayIso } from '@/lib/format'
import { bulletRows } from '@/lib/print-report'
import { sumOf } from '@/lib/transactions'
import { heatLevels, monthTotals, sparkPoints } from '@/lib/report'
import { cn } from '@/lib/utils'
import type { MonthlyReport } from '@/types'

export type ReportDetail =
  | { type: 'day'; day: number }
  | { type: 'category'; categoryId: string }
  | { type: 'month'; month: string }
  | null

/** A month total in a three-column row. On phones each column is ~70px, so six figures and up go compact (₱123.5K). */
export function TotalAmount({ value }: { value: number }) {
  if (value < 1e5) return money(value, { whole: true })
  return (
    <>
      <span className="sm:hidden">{money(value, { compact: true })}</span>
      <span className="hidden sm:inline">{money(value, { whole: true })}</span>
    </>
  )
}

/** A total's label with the swatch tying it to its chart series, when it has one. */
export const TotalLabel = ({ label, swatch }: { label: string; swatch: string }) => (
  <span className="flex items-center gap-1.5">{swatch && <span aria-hidden className={cn('size-2 shrink-0 rounded-[2px]', swatch)} />}{label}</span>
)

/**
 * A bullet chart: spending per category as bars on one peso scale, each over a band as long as its budget, and a small
 * line of its last six months when trends are given. The band stops at the budget, not the row's end, so an unused budget
 * reads as room to spend rather than a stray mark. Rows are buttons when onSelect is given.
 */
export function CategoryBreakdown({ items, budgets = [], trends = [], onSelect }: { items: MonthlyReport['byCategory']; budgets?: MonthlyReport['budgets']; trends?: MonthlyReport['categoryTrend']; onSelect?: (categoryId: string) => void }) {
  const { category } = useRefData()
  const rows = bulletRows({ byCategory: items, budgets }, (id) => category(id)?.name ?? 'Other')
    .map((r) => ({ ...r, spark: sparkPoints(trends.find((t) => t.categoryId === r.id)?.totals ?? []) }))
  const hasBudgets = rows.some((r) => r.tick !== null)
  const hasSparks = rows.some((r) => r.spark)
  return (
    <div className="grid gap-1">
      {(hasBudgets || hasSparks) && (
        <p aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-r-sm bg-chart-2" />Spent</span>
          {hasBudgets && <span className="flex items-center gap-1.5"><span className="flex h-3 items-center"><span className="h-2 w-3 bg-foreground/10" /><span className="h-3 w-0.5 bg-foreground" /></span>Budget</span>}
          {hasSparks && <span className="flex items-center gap-1.5"><svg viewBox="0 0 12 8" className="h-2 w-3"><polyline points="0,7 4,3 8,5 12,1" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>Last 6 months</span>}
        </p>
      )}
      {/* Two columns when the Reports grid is wide: each still reads down from most to least spent, on one peso scale. */}
      <div className="gap-x-6 *:mb-1 *:break-inside-avoid @4xl:columns-2">
      {rows.map(({ id, name, spent, share, limit, left, bar, tick, spark }) => {
        const over = left !== null && left < 0
        const budgetLine = limit !== null && remainingOfLimit({ spent, limit })
        return (
          <Item
            key={id}
            size="xs"
            className={onSelect ? '-mx-3 text-left hover:bg-muted active:bg-muted' : '-mx-3'}
            render={onSelect ? <button type="button" onClick={() => onSelect(id)} aria-label={`${name}: ${money(spent, { whole: true })}, ${share}% of spending. ${budgetLine || 'No budget'}. Show details`} /> : undefined}
          >
            <ItemContent>
              <div className="flex items-center gap-2 text-sm">
                <CategoryMedia category={category(id)} />
                <span className="font-medium">{name}</span>
                <span className="ml-auto shrink-0 tabular-nums">{money(spent, { whole: true })} <span className="text-muted-foreground">({share}%)</span></span>
              </div>
              <div aria-hidden className="relative mt-1 h-4">
                {tick !== null && <div className="absolute inset-y-1 left-0 bg-foreground/10" style={{ width: `${tick}%` }} />}
                <div className={cn('absolute inset-y-1 left-0 rounded-r-sm', over ? 'bg-destructive' : 'bg-chart-2')} style={{ width: `${bar}%` }} />
                {tick !== null && <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground ring-2 ring-card" style={{ left: `${tick}%` }} />}
              </div>
              {(budgetLine || spark) && (
                <div className="flex items-center gap-2">
                  {budgetLine && <p className={cn('text-xs tabular-nums', over ? 'text-destructive' : 'text-muted-foreground')}>{budgetLine}</p>}
                  {spark && <svg aria-hidden viewBox="0 0 60 15" className="ml-auto h-[15px] w-[60px] shrink-0 text-muted-foreground"><polyline points={spark} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>}
                </div>
              )}
            </ItemContent>
          </Item>
        )
      })}
      </div>
    </div>
  )
}

const HEAT = ['bg-muted text-muted-foreground', 'bg-chart-2/50 text-foreground', 'bg-chart-2/67 text-foreground', 'bg-chart-2/83 text-foreground', 'bg-chart-2 text-background']

/** A month of daily spending, Monday first like Home's week. Every day is a finger-sized target, unlike a point on the pace chart. */
export function SpendingCalendar({ month, daily, onDay }: { month: string; daily: MonthlyReport['daily']; onDay: (day: number) => void }) {
  const firstColumn = ((new Date(`${month}-01T12:00:00`).getDay() + 6) % 7) + 1
  const levels = heatLevels(daily)
  return (
    <div className="flex flex-1 flex-col">
      {/* The first row fits the weekday names. The weeks share whatever height the card has to spare, up to a limit. */}
      <div className="grid max-h-96 flex-1 auto-rows-fr grid-cols-7 grid-rows-[auto] gap-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} aria-hidden className="text-center text-xs text-muted-foreground">{d}</span>)}
        {Array.from({ length: daysIn(month) }, (_, i) => {
          const day = i + 1
          const iso = dayIso(month, day)
          // daily stops at today, so a day still to come has no label and no shade.
          const spent = daily[i]?.spent
          const label = spent === undefined ? undefined : `${dayLabel(iso)}: ${spent ? `${money(spent, { whole: true })} spent` : 'nothing spent'}`
          return (
            <button
              key={day}
              type="button"
              disabled={!label}
              onClick={() => onDay(day)}
              aria-label={label}
              title={label}
              aria-current={iso === todayIso() ? 'date' : undefined}
              style={day === 1 ? { gridColumnStart: firstColumn } : undefined}
              className={cn(
                'min-h-11 rounded-md text-xs tabular-nums hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:opacity-70 disabled:text-muted-foreground/50 disabled:hover:opacity-100',
                HEAT[levels[i]],
                iso === todayIso() && 'ring-2 ring-foreground ring-inset',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
      <p aria-hidden className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        Less
        {HEAT.slice(1).map((h) => <span key={h} className={cn('size-3 rounded-[2px]', h)} />)}
        More
      </p>
    </div>
  )
}

/** Everything spent on one day. */
export function DayDetail({ month, day, onClose }: { month: string; day: number; onClose: () => void }) {
  const date = dayIso(month, day)
  const { data } = useQuery(`tx:${month}`, () => api.transactions.list({ month }))
  const items = (data ?? []).filter((t) => t.date === date)
  const spent = sumOf(items, 'expense')
  const navigate = useNavigate()
  return (
    <ResponsivePanel
      onClose={onClose}
      title={dayLabel(date)}
      description={spent ? `${money(spent)} spent this day` : 'Nothing spent this day'}
      // Replace, not push: the panel's own history entry goes, so Back from Activity returns to Reports.
      footer={items.length > 0 && <Button variant="outline" onClick={() => navigate(`${monthLink('/activity', month)}#day-${date}`, { replace: true })}>See in Activity</Button>}
    >
      {!data ? <LoadingItems rows={3} /> : items.length ? (
        <ItemGroup className="pb-4">{items.map((t) => <TransactionItem key={t.id} t={t} />)}</ItemGroup>
      ) : (
        <p className="pb-4 text-sm text-muted-foreground">No transactions on this day.</p>
      )}
    </ResponsivePanel>
  )
}

const HistoryChart = lazy(() => import('@/components/report-charts').then((m) => ({ default: m.HistoryChart })))

/** One category: its total, budget, last six months, and this month's transactions. */
export function CategoryDetail({ month, categoryId, onClose }: { month: string; categoryId: string; onClose: () => void }) {
  const { category } = useRefData()
  const cat = category(categoryId)
  // Only the six months the chart shows, not the category's whole history.
  const since = `${shiftMonth(month, -5)}-01`
  const { data: all } = useQuery(`cat-tx:${categoryId}:${since}`, () => api.transactions.list({ categoryId, since }))
  const { data: budgets } = useQuery(`budgets:${month}`, () => api.budgets.list(month))
  const { data: report } = useQuery(`report:${month}`, () => api.reports.monthly(month))

  const expenses = (all ?? []).filter((t) => t.kind === 'expense')
  const history = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(month, i - 5)
    return { month: m, spent: sumOf(expenses.filter((t) => t.date.startsWith(m)), 'expense') }
  })
  const thisMonth = expenses.filter((t) => t.date.startsWith(month))
  const total = history.at(-1)?.spent ?? 0
  const monthTotal = report?.byCategory.reduce((s, c) => s + c.total, 0) ?? 0
  const budget = budgets?.find((b) => b.categoryId === categoryId)
  const navigate = useNavigate()

  return (
    <ResponsivePanel
      onClose={onClose}
      title={cat?.name ?? 'Category'}
      description={`Spending in ${monthLabel(month)}`}
      footer={thisMonth.length > 0 && (
        <Button variant="outline" onClick={() => navigate(monthLink('/activity', month, { category: categoryId }), { replace: true })}>
          See in Activity
        </Button>
      )}
    >
      {!all ? (
        <div aria-busy className="grid gap-6 pb-4">
          <div className="grid gap-1.5"><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-64 max-w-full" /></div>
          <Skeleton className="h-40 w-full" />
          <LoadingItems rows={2} />
        </div>
      ) : (
        <div className="grid gap-6 pb-4">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{money(total, { whole: true })}</p>
            {monthTotal > 0 && <p className="text-sm text-muted-foreground">{Math.round((total / monthTotal) * 100)}% of everything you spent this month</p>}
          </div>

          {budget && (
            <Progress value={budgetPercent(budget)} className={OVER_BAR[budgetState(budget)]}>
              <ProgressLabel>Budget {money(budget.limit, { whole: true })}</ProgressLabel>
              <span className="ml-auto flex items-center gap-2 text-sm tabular-nums">{budgetRemaining(budget)} <BudgetBadge state={budgetState(budget)} /></span>
            </Progress>
          )}

          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Last 6 months</h3>
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <HistoryChart data={history} month={month} />
            </Suspense>
          </div>

          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Transactions in {monthLabel(month, 'short')}</h3>
            {thisMonth.length
              ? <ItemGroup>{thisMonth.map((t) => <TransactionItem key={t.id} t={t} />)}</ItemGroup>
              : <p className="text-sm text-muted-foreground">Nothing in this category this month.</p>}
          </div>
        </div>
      )}
    </ResponsivePanel>
  )
}

/** One month from the six-month chart: totals and where the money went, with a way to switch the page to it. */
export function MonthDetail({ month, onClose, onOpen }: { month: string; onClose: () => void; onOpen: (month: string) => void }) {
  const { data } = useQuery(`report:${month}`, () => api.reports.monthly(month))
  const totals = data?.trend.at(-1)
  return (
    <ResponsivePanel
      onClose={onClose}
      title={monthLabel(month)}
      description="Income, spending and where it went"
      footer={<Button onClick={() => onOpen(month)}>Show full report for {monthLabel(month, 'short')}</Button>}
    >
      {!data || !totals ? (
        <div aria-busy className="grid gap-6 pb-4">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="grid gap-1.5"><Skeleton className="h-4 w-14" /><Skeleton className="h-5 w-20" /></div>)}
          </div>
          <LoadingItems rows={4} amount={false} progress />
        </div>
      ) : (
        <div className="grid gap-6 pb-4">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {monthTotals(totals.income, totals.spent).map(([label, value, tone, swatch]) => (
              <div key={label}>
                <dt className="text-muted-foreground"><TotalLabel label={label} swatch={swatch} /></dt>
                <dd className={`text-base font-semibold tabular-nums ${tone}`}><TotalAmount value={value} /></dd>
              </div>
            ))}
          </dl>
          {data.byCategory.length
            ? <CategoryBreakdown items={data.byCategory} budgets={data.budgets} trends={data.categoryTrend} />
            : <p className="text-sm text-muted-foreground">No spending this month.</p>}
        </div>
      )}
    </ResponsivePanel>
  )
}
