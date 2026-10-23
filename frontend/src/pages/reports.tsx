// Where the money went this month, and how the last six months compare. Every chart opens a detail panel.
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { ChartPie } from 'lucide-react'
import { useApp, useMonth, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { MonthSwitcher } from '@/components/month-switcher'
import { PageHeader } from '@/components/page-header'
import { CategoryBreakdown, CategoryDetail, DayDetail, MonthDetail, TotalAmount, type ReportDetail } from '@/components/report-details'
import { EmptyState, ErrorState, LoadingCard, LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dateInMonth, dayIso, dayLabel, money, monthLabel } from '@/lib/format'
import { monthTotals } from '@/lib/report'

const PaceChart = lazy(() => import('@/components/report-charts').then((m) => ({ default: m.PaceChart })))
const TrendChart = lazy(() => import('@/components/report-charts').then((m) => ({ default: m.TrendChart })))

/** Totals, the month chart, then breakdown and trend side by side, like the loaded report. */
function LoadingReport() {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} aria-busy>
            <CardHeader>
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-5 w-20 sm:h-7 sm:w-28" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <LoadingCard><Skeleton className="h-56 w-full sm:h-64" /></LoadingCard>
      <div className="grid items-start gap-5 md:gap-6 lg:grid-cols-2">
        <LoadingCard><LoadingItems rows={4} amount={false} progress /></LoadingCard>
        <LoadingCard><Skeleton className="h-64 w-full" /></LoadingCard>
      </div>
    </>
  )
}

export function ReportsPage() {
  const [month, setMonth] = useMonth()
  const { openAdd } = useApp()
  const { data, error, loading } = useQuery(`report:${month}`, () => api.reports.monthly(month))
  const { data: summary } = useQuery(`summary:${month}`, () => api.reports.summary(month))
  const [asTable, setAsTable] = useState(false)
  const [paceAsTable, setPaceAsTable] = useState(false)
  const [detail, setDetail] = useState<ReportDetail>(null)

  const { category } = useRefData()
  const thisMonth = data?.trend.at(-1)
  const top = data?.byCategory[0]
  const spentTotal = data?.byCategory.reduce((s, c) => s + c.total, 0) ?? 0

  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
  // Today in this month, else the month's last day: the running total stops here, later days are still to come.
  const lastDay = Number(dateInMonth(month).slice(8))
  const budget = summary?.budget
  // Running total per day (carried through days with no spending) against a straight line from 0 to the
  // monthly budget. The line joins once the summary loads; without it the running total still draws.
  const pace = useMemo(() => {
    if (!data) return []
    let running = 0
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      running += data.daily.find((d) => d.day === day)?.spent ?? 0
      return {
        day,
        spent: day <= lastDay ? running : undefined,
        pace: budget ? Math.round((budget * day) / daysInMonth) : undefined,
      }
    })
  }, [data, budget, daysInMonth, lastDay])
  // Any day up to today opens; a day with nothing spent says so in its panel. Taps past the plot (NaN) do nothing.
  const openDay = useCallback((day: number) => { if (day >= 1 && day <= lastDay) setDetail({ type: 'day', day }) }, [lastDay])
  const openMonth = useCallback((m: string) => setDetail({ type: 'month', month: m }), [])

  return (
    <>
      <PageHeader
        page="Reports"
        headline={!data ? 'Reports' : top ? `${category(top.categoryId)?.name ?? 'Other'} took ${Math.round((top.total / spentTotal) * 100)}% of your spending` : 'No spending recorded'}
        description="Tap any chart for details."
      />
      <MonthSwitcher month={month} onChange={setMonth} />

      {error ? <ErrorState error={error} /> : loading && !data ? <LoadingReport /> : data && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {monthTotals(thisMonth?.income ?? 0, thisMonth?.spent ?? 0).map(([label, value, tone]) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className={`text-base font-semibold tabular-nums sm:text-2xl ${tone}`}>
                    <TotalAmount value={value} />
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          {spentTotal > 0 && (
          <Card>
            <CardHeader>
              <CardTitle id="pace-title" role="heading" aria-level={2}>Spending through the month</CardTitle>
              <CardDescription>
                {budget ? 'Running total against your monthly budget. ' : 'Running total for the month. '}
                Tap a day to see what you spent.
              </CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" aria-describedby="pace-title" onClick={() => setPaceAsTable((v) => !v)}>{paceAsTable ? 'Show chart' : 'Show as table'}</Button>
              </CardAction>
            </CardHeader>
            <CardContent>
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
                <Suspense fallback={<Skeleton className="h-56 w-full sm:h-64" />}>
                  <PaceChart data={pace} onDay={openDay} />
                </Suspense>
              )}
            </CardContent>
          </Card>
          )}

          <div className="grid items-start gap-5 md:gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>Where your money went</CardTitle>
                <CardDescription>Spending by category in {monthLabel(month)}. Select one for details.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.byCategory.length ? (
                  <CategoryBreakdown items={data.byCategory} onSelect={(categoryId) => setDetail({ type: 'category', categoryId })} />
                ) : (
                  <EmptyState icon={ChartPie} title={`No spending in ${monthLabel(month)}`} body="Expenses you add for this month are broken down here by category." action={<Button variant="outline" onClick={() => openAdd({ kind: 'expense', date: dateInMonth(month) })}>Add expense</Button>} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle id="trend-title" role="heading" aria-level={2}>Income and spending</CardTitle>
                <CardDescription>Last 6 months. Tap a month for its breakdown.</CardDescription>
                <CardAction>
                  <Button variant="ghost" size="sm" aria-describedby="trend-title" onClick={() => setAsTable((v) => !v)}>{asTable ? 'Show chart' : 'Show as table'}</Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {asTable ? (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Month</TableHead><TableHead className="text-right">Income</TableHead><TableHead className="text-right">Spending</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.trend.map((m) => (
                        <TableRow key={m.month}>
                          <TableCell>
                            <Button variant="link" className="h-auto p-0" onClick={() => setDetail({ type: 'month', month: m.month })}>{monthLabel(m.month)}</Button>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{money(m.income, { whole: true })}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(m.spent, { whole: true })}</TableCell>
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
          </div>
        </>
      )}

      {detail?.type === 'day' && <DayDetail month={month} day={detail.day} onClose={() => setDetail(null)} />}
      {detail?.type === 'category' && <CategoryDetail month={month} categoryId={detail.categoryId} onClose={() => setDetail(null)} />}
      {detail?.type === 'month' && (
        <MonthDetail month={detail.month} onClose={() => setDetail(null)} onOpen={(m) => { setMonth(m); setDetail(null) }} />
      )}
    </>
  )
}
