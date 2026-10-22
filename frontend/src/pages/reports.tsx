// Where the money went this month, and how the last six months compare. Every chart opens a detail panel.
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { ChartPie } from 'lucide-react'
import { useApp, useMonth, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { MonthSwitcher } from '@/components/month-switcher'
import { PageHeader } from '@/components/page-header'
import { CategoryBreakdown, CategoryDetail, DayDetail, MonthDetail, type ReportDetail } from '@/components/report-details'
import { EmptyState, ErrorState, LoadingCard, LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dateInMonth, money, monthLabel } from '@/lib/format'
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
  const [detail, setDetail] = useState<ReportDetail>(null)

  const { category } = useRefData()
  const thisMonth = data?.trend.at(-1)
  const top = data?.byCategory[0]
  const spentTotal = data?.byCategory.reduce((s, c) => s + c.total, 0) ?? 0

  // Running total per day against a straight line from 0 to the monthly budget.
  const pace = useMemo(() => {
    if (!summary || !data) return []
    let running = 0
    return Array.from({ length: summary.daysInMonth }, (_, i) => {
      const day = i + 1
      const spentToday = data.daily.find((d) => d.day === day)
      if (spentToday) running += spentToday.spent
      return {
        day,
        spent: spentToday ? running : undefined,
        pace: summary.budget ? Math.round((summary.budget * day) / summary.daysInMonth) : undefined,
      }
    })
  }, [summary, data])
  const openDay = useCallback((day: number) => { if (data?.daily.some((d) => d.day === day)) setDetail({ type: 'day', day }) }, [data])
  const openMonth = useCallback((m: string) => setDetail({ type: 'month', month: m }), [])

  return (
    <>
      <PageHeader
        page="Reports"
        headline={!data ? 'Reports' : top ? `${category(top.categoryId)?.name ?? 'Other'} took ${Math.round((top.total / spentTotal) * 100)}% of your spending` : `No spending in ${monthLabel(month)}`}
        description={`${monthLabel(month)}. Tap any chart for details.`}
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
                    {money(value, { whole: true })}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          {spentTotal > 0 && (
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Spending through the month</CardTitle>
              <CardDescription>
                {summary?.budget ? 'Running total against your monthly budget. ' : 'Running total for the month. '}
                Tap a day to see what you spent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-56 w-full sm:h-64" />}>
                <PaceChart data={pace} onDay={openDay} />
              </Suspense>
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
                <CardTitle role="heading" aria-level={2}>Income and spending</CardTitle>
                <CardDescription>Last 6 months. Tap a month for its breakdown.</CardDescription>
                <CardAction>
                  <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)}>{asTable ? 'Show chart' : 'Show as table'}</Button>
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
