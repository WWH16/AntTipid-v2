// Where the money went this month, and how the last six months compare. Every chart opens a detail panel.
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { ChartPie, Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp, useMonth, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { MonthSwitcher } from '@/components/month-switcher'
import { PageHeader } from '@/components/page-header'
import { CategoryBreakdown, CategoryDetail, DayDetail, MonthDetail, SpendingCalendar, TotalAmount, TotalLabel, type ReportDetail } from '@/components/report-details'
import { HeroCard } from '@/components/hero-card'
import { EmptyState, ErrorState, LoadingCard, LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { currentMonth, dateInMonth, dayIso, dayLabel, daysIn, money, monthLabel } from '@/lib/format'
import { endLine, everyday, fixedPart, leavesOut, monthBudgets, outsideBudgets, paceHeadline, paceLine, projection, withUnusual } from '@/lib/budget'
import { printDate } from '@/lib/print-report'
import { monthTotals, savedMonths, totalNotes } from '@/lib/report'
import { useAnomalies } from '@/lib/transactions'
import { cn } from '@/lib/utils'

const PaceChart = lazy(() => import('@/components/report-charts').then((m) => ({ default: m.PaceChart })))
const TrendChart = lazy(() => import('@/components/report-charts').then((m) => ({ default: m.TrendChart })))
const SavedChart = lazy(() => import('@/components/report-charts').then((m) => ({ default: m.SavedChart })))

// The bento. Breakpoints follow the grid's own width (container queries), since the sidebar takes part of the screen and
// can collapse. Narrow: earned and spent side by side over saved, then one column. Wide: the totals stacked beside the
// month chart, the breakdown beside the calendar, then the two six-month charts.
const BENTO = '@container/report grid grid-cols-12 gap-3 md:gap-4'
const tile = (i: number) => cn(i === 2 ? 'col-span-12' : 'col-span-6', '@md:col-span-4')
// Fixed in place, so the totals stack in the columns it leaves free.
const BESIDE_TOTALS = '@4xl:col-span-8 @4xl:col-start-5 @4xl:row-span-3 @4xl:row-start-1'

/** The bento's shape, like the loaded report. */
function LoadingReport() {
  return (
    <div className={BENTO}>
      {[0, 1, 2].map((i) => (
        <Card key={i} aria-busy className={tile(i)}>
          <CardHeader>
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-7 w-20 sm:w-28" />
          </CardHeader>
        </Card>
      ))}
      <LoadingCard className={cn('col-span-12', BESIDE_TOTALS)}><Skeleton className="h-56 w-full sm:h-64 @4xl:h-80" /></LoadingCard>
      <LoadingCard className="col-span-12 @4xl:col-span-8"><LoadingItems rows={4} amount={false} progress /></LoadingCard>
      <LoadingCard className="col-span-12 @4xl:col-span-4"><Skeleton className="h-64 w-full" /></LoadingCard>
    </div>
  )
}

export function ReportsPage() {
  const [month, setMonth] = useMonth()
  const { openAdd } = useApp()
  const { data, error, loading } = useQuery(`report:${month}`, () => api.reports.monthly(month))
  const { data: summary } = useQuery(`summary:${month}`, () => api.reports.summary(month))
  const { data: unusual } = useAnomalies(month)
  const [asTable, setAsTable] = useState(false)
  const [paceAsTable, setPaceAsTable] = useState(false)
  const [detail, setDetail] = useState<ReportDetail>(null)

  const { category } = useRefData()
  const budgets = useMemo(() => data && monthBudgets(data), [data])
  const outside = budgets && outsideBudgets(budgets)
  // How a finished month ended against its budgets. Not for a month still going (it would always look under), or
  // one with nothing recorded (it wasn't tracked, not saved).
  const finished = month < currentMonth()
  const ended = data?.byCategory.length && finished ? budgets : undefined
  const monthly = ended?.find((b) => b.categoryId === null)
  const thisMonth = data?.trend.at(-1)
  // Nothing this month, or nothing in all 6: totals, "tap a chart" and an axis-only chart have nothing behind them.
  const monthEmpty = !!thisMonth && !thisMonth.income && !thisMonth.spent
  const historyEmpty = !!data && data.trend.every((m) => !m.income && !m.spent)
  const top = data?.byCategory[0]
  const spentTotal = data?.byCategory.reduce((s, c) => s + c.total, 0) ?? 0

  const daysInMonth = daysIn(month)
  // Today in this month, else the month's last day: the running total stops here, later days are still to come.
  const lastDay = Number(dateInMonth(month).slice(8))
  const budget = summary?.budget
  const going = finished ? undefined : budgets?.find((b) => b.categoryId === null)
  const fixed = useMemo(() => summary && unusual && withUnusual(fixedPart(summary.fixed, budgets ?? []), unusual), [summary, unusual, budgets])
  // Running total per day (carried through days with no spending) against a straight line from 0 to the monthly
  // budget, and where this pace is heading. Both join once their data loads; without them the running total still draws.
  const pace = useMemo(() => {
    if (!data) return []
    const ahead = going && fixed ? projection(going, fixed, month) : null
    let running = 0
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      running += data.daily.find((d) => d.day === day)?.spent ?? 0
      return {
        day,
        spent: day <= lastDay ? running : undefined,
        pace: budget ? Math.round((budget * day) / daysInMonth) : undefined,
        projected: ahead?.[day],
      }
    })
  }, [data, going, fixed, budget, month, daysInMonth, lastDay])
  // The same sentence and caveat Budgets shows, so the two pages never name different run-out dates.
  const paced = going && fixed && everyday(going, fixed)
  const paceNote = paced && paceLine(paced, month)
  const fixedNote = paced && summary && unusual && leavesOut(summary.fixed.map((f) => category(f.categoryId)?.name ?? 'Other'), unusual)
  const onPaceToday = pace[lastDay - 1]?.pace
  const paceTitle = monthly ? endLine(monthly) : going && onPaceToday ? paceHeadline(going.spent, onPaceToday) : 'Spending through the month'
  const markers = useMemo(() => (unusual ?? []).flatMap((a) => {
    if (!a.date) return []
    const day = Number(a.date.slice(8))
    return [{ id: a.transactionId, day, total: pace[day - 1]?.spent ?? 0, title: a.title, amount: a.amount, date: a.date }]
  }), [unusual, pace])
  const saved = useMemo(() => data && savedMonths(data.trend), [data])
  const notes = data ? totalNotes(data.trend, finished) : []
  const biggest = data?.daily.reduce((a, b) => (b.spent > a.spent ? b : a), data.daily[0])
  // The day table is too long to sit beside the totals.
  const totalsBeside = spentTotal > 0 && !paceAsTable
  const showSaved = !asTable && !!saved && saved.count >= 2
  // Any day up to today opens; a day with nothing spent says so in its panel. Taps past the plot (NaN) do nothing.
  const openDay = useCallback((day: number) => { if (day >= 1 && day <= lastDay) setDetail({ type: 'day', day }) }, [lastDay])
  const openMonth = useCallback((m: string) => setDetail({ type: 'month', month: m }), [])

  return (
    <>
      <PageHeader
        page="Reports"
        headline={!data ? 'Reports' : top ? `${category(top.categoryId)?.name ?? 'Other'} took ${Math.round((top.total / spentTotal) * 100)}% of your spending` : 'No spending recorded'}
        description={monthEmpty ? undefined : 'Tap any chart for details.'}
        action={
          <Button variant="outline" size="sm" aria-label="Print preview" nativeButton={false} render={<Link to={`/reports/print?month=${month}`} />}>
            <Printer /><span className="hidden sm:inline">Print preview</span>
          </Button>
        }
      />
      <MonthSwitcher month={month} onChange={setMonth} />

      {error ? <ErrorState error={error} /> : loading && !data ? <LoadingReport /> : data && (
        <div className={BENTO}>
          {!monthEmpty && monthTotals(thisMonth?.income ?? 0, thisMonth?.spent ?? 0).map(([label, value, tone, swatch], i) => {
            const Tile = i === 2 ? HeroCard : Card
            return (
              <Tile key={label} className={tile(i)}>
                <CardHeader>
                  <CardDescription><TotalLabel label={label} swatch={swatch} /></CardDescription>
                  <CardTitle className={cn('text-xl font-semibold tabular-nums sm:text-2xl @4xl/report:text-3xl', tone && 'text-destructive-on-primary')}>
                    <TotalAmount value={value} />
                  </CardTitle>
                  {notes[i] && <p className="text-xs text-muted-foreground tabular-nums">{notes[i]}</p>}
                </CardHeader>
              </Tile>
            )
          })}

          {spentTotal > 0 && (
            <Card className={cn('col-span-12', totalsBeside && BESIDE_TOTALS)}>
              <CardHeader>
                <CardTitle id="pace-title" role="heading" aria-level={2}>{paceTitle}</CardTitle>
                <CardDescription>
                  {budget ? 'Running total against your monthly budget. ' : 'Running total for the month. '}
                  Tap a day to see what you spent.
                </CardDescription>
                <CardAction>
                  <Button variant="ghost" size="sm" aria-describedby="pace-title" onClick={() => setPaceAsTable((v) => !v)}>{paceAsTable ? 'Show chart' : 'Show as table'}</Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-3">
                {paceAsTable ? (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Day</TableHead><TableHead className="text-right">Spent</TableHead><TableHead className="text-right">So far</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.daily.map((d) => (
                        <TableRow key={d.day}>
                          <TableCell>
                            <Button variant="link" className="h-auto p-0" onClick={() => openDay(d.day)}>{dayLabel(dayIso(month, d.day))}</Button>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{money(d.spent, { whole: true })}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(pace[d.day - 1]?.spent ?? 0, { whole: true })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Suspense fallback={<Skeleton className="h-56 w-full sm:h-64 @4xl:h-80" />}>
                    <PaceChart data={pace} markers={markers} onDay={openDay} />
                  </Suspense>
                )}
                {paceNote && <p className="text-sm font-medium tabular-nums">{paceNote}</p>}
                {fixedNote && <p className="text-xs text-muted-foreground">{fixedNote}</p>}
                {markers.map((m) => (
                  <p key={m.id} className="flex items-baseline gap-2 text-sm text-muted-foreground tabular-nums">
                    <span aria-hidden className="size-2.5 shrink-0 translate-y-px rounded-full bg-foreground" />
                    <span>Unusual purchase: {m.title}, {money(m.amount, { whole: true })} on {printDate(m.date)}.</span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className={cn('col-span-12', spentTotal > 0 && '@4xl:col-span-8')}>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Where your money went</CardTitle>
              {data.byCategory.length > 0 && <CardDescription>Spending by category in {monthLabel(month)}. Select one for details.</CardDescription>}
            </CardHeader>
            <CardContent className="grid gap-4">
              {outside && outside.spent > 0 && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {money(outside.spent, { whole: true })} of {money(outside.total, { whole: true })} ({Math.round((outside.spent / outside.total) * 100)}%) went to categories without a budget.
                </p>
              )}
              {data.byCategory.length ? (
                <CategoryBreakdown items={data.byCategory} budgets={data.budgets} trends={data.categoryTrend} onSelect={(categoryId) => setDetail({ type: 'category', categoryId })} />
              ) : (
                <EmptyState icon={ChartPie} title={`No spending in ${monthLabel(month)}`} body="Expenses you add for this month are broken down here by category." action={<Button variant="outline" onClick={() => openAdd({ kind: 'expense', date: dateInMonth(month) })}>Add expense</Button>} />
              )}
            </CardContent>
          </Card>

          {spentTotal > 0 && biggest && (
            <Card className="col-span-12 @4xl:col-span-4">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>Biggest day: {dayLabel(dayIso(month, biggest.day))}</CardTitle>
                <CardDescription>{money(biggest.spent, { whole: true })} spent. Darker days cost more. Tap a day to see what you spent.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <SpendingCalendar month={month} daily={data.daily} onDay={openDay} />
              </CardContent>
            </Card>
          )}

          <Card className={cn('col-span-12', showSaved && '@2xl:col-span-7')}>
            <CardHeader>
              <CardTitle id="trend-title" role="heading" aria-level={2}>Income and spending</CardTitle>
              <CardDescription>
                {historyEmpty ? 'Your income and spending over the last 6 months show here once you add some.' : 'Last 6 months. Tap a month for its breakdown.'}
              </CardDescription>
              {!historyEmpty && (
                <CardAction>
                  <Button variant="ghost" size="sm" aria-describedby="trend-title" onClick={() => setAsTable((v) => !v)}>{asTable ? 'Show chart' : 'Show as table'}</Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className={cn(historyEmpty && 'hidden')}>
              {asTable ? (
                <Table className="[&_td]:px-1 [&_th]:px-1 sm:[&_td]:px-2 sm:[&_th]:px-2">
                  <TableHeader>
                    <TableRow><TableHead>Month</TableHead><TableHead className="text-right">Income</TableHead><TableHead className="text-right">Spending</TableHead><TableHead className="text-right">Saved</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.trend.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell>
                          <Button variant="link" className="h-auto p-0" onClick={() => setDetail({ type: 'month', month: m.month })}>{monthLabel(m.month, 'short')}</Button>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(m.income, { whole: true })}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(m.spent, { whole: true })}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', m.income < m.spent && 'text-destructive')}>{money(m.income - m.spent, { whole: true })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <TrendChart data={data.trend} onMonth={openMonth} />
                </Suspense>
              )}
            </CardContent>
          </Card>

          {/* In table view, the Saved column above shows this. */}
          {showSaved && (
            <Card className="col-span-12 @2xl:col-span-5">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>{saved.line}</CardTitle>
                <CardDescription>Income minus spending per month. Tap a month for its breakdown.</CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<Skeleton className="h-48 w-full @2xl:h-64" />}>
                  <SavedChart data={saved.rows} onMonth={openMonth} />
                </Suspense>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {detail?.type === 'day' && <DayDetail month={month} day={detail.day} onClose={() => setDetail(null)} />}
      {detail?.type === 'category' && <CategoryDetail month={month} categoryId={detail.categoryId} onClose={() => setDetail(null)} />}
      {detail?.type === 'month' && (
        <MonthDetail month={detail.month} onClose={() => setDetail(null)} onOpen={(m) => { setMonth(m); setDetail(null) }} />
      )}
    </>
  )
}
