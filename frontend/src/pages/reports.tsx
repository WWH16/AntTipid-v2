// Where the money went this month, and how the last six months compare. Every chart opens a detail panel.
import { useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { useMonth, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { MonthSwitcher } from '@/components/month-switcher'
import { PageHeader } from '@/components/page-header'
import { CategoryBreakdown, CategoryDetail, DayDetail, MonthDetail, type ReportDetail } from '@/components/report-details'
import { EmptyState, ErrorState, LoadingCard, LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { money, monthLabel } from '@/lib/format'
import { moneyTooltip, monthTotals } from '@/lib/report'

const trendConfig = {
  income: { label: 'Income', color: 'var(--chart-1)' },
  spent: { label: 'Spending', color: 'var(--chart-2)' },
} satisfies ChartConfig

const paceConfig = {
  spent: { label: 'Spent so far', color: 'var(--chart-2)' },
  pace: { label: 'On-budget pace', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

// Recharts passes the hovered x value as activeLabel on chart clicks.
type ChartClick = { activeLabel?: string | number } | null

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
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <LoadingCard><LoadingItems rows={4} amount={false} progress /></LoadingCard>
        <LoadingCard><Skeleton className="h-64 w-full" /></LoadingCard>
      </div>
    </>
  )
}

export function ReportsPage() {
  const [month, setMonth] = useMonth()
  const { data, error, loading } = useQuery(`report:${month}`, () => api.reports.monthly(month))
  const { data: summary } = useQuery(`summary:${month}`, () => api.reports.summary(month))
  const [asTable, setAsTable] = useState(false)
  const [detail, setDetail] = useState<ReportDetail>(null)

  const { category } = useRefData()
  const thisMonth = data?.trend.at(-1)
  const top = data?.byCategory[0]
  const spentTotal = data?.byCategory.reduce((s, c) => s + c.total, 0) ?? 0

  // Running total per day against a straight line from 0 to the monthly budget.
  let running = 0
  const pace = summary && data
    ? Array.from({ length: summary.daysInMonth }, (_, i) => {
      const day = i + 1
      const spentToday = data.daily.find((d) => d.day === day)
      if (spentToday) running += spentToday.spent
      return {
        day,
        spent: spentToday ? running : undefined,
        pace: summary.budget ? Math.round((summary.budget * day) / summary.daysInMonth) : undefined,
      }
    })
    : []

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
              <ChartContainer config={paceConfig} className="aspect-auto h-56 w-full cursor-pointer sm:h-64">
                <ComposedChart
                  accessibilityLayer
                  data={pace}
                  margin={{ left: 4, right: 8 }}
                  onClick={(s: ChartClick) => {
                    const day = Number(s?.activeLabel)
                    if (day && data.daily.some((d) => d.day === day)) setDetail({ type: 'day', day })
                  }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `₱${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => `Day ${d}`} formatter={moneyTooltip(paceConfig)} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area dataKey="spent" type="monotone" stroke="var(--color-spent)" strokeWidth={2} fill="var(--color-spent)" fillOpacity={0.15} connectNulls={false} />
                  {summary?.budget ? <Line dataKey="pace" type="linear" stroke="var(--color-pace)" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={false} /> : null}
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>Where your money went</CardTitle>
                <CardDescription>Spending by category in {monthLabel(month)}. Select one for details.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.byCategory.length ? (
                  <CategoryBreakdown items={data.byCategory} onSelect={(categoryId) => setDetail({ type: 'category', categoryId })} />
                ) : (
                  <EmptyState title={`No spending in ${monthLabel(month)}`} body="Expenses you add for this month are broken down here by category." />
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
                  <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full cursor-pointer">
                    <BarChart
                      accessibilityLayer
                      data={data.trend}
                      onClick={(s: ChartClick) => { if (s?.activeLabel) setDetail({ type: 'month', month: String(s.activeLabel) }) }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={(m) => monthLabel(m, 'short')} />
                      <ChartTooltip content={<ChartTooltipContent labelFormatter={(m) => monthLabel(String(m))} formatter={moneyTooltip(trendConfig)} />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="income" fill="var(--color-income)" radius={4} />
                      <Bar dataKey="spent" fill="var(--color-spent)" radius={4} />
                    </BarChart>
                  </ChartContainer>
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
