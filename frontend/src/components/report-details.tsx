// Drill-down panels for the Reports charts: one day, one category, one month.
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from 'recharts'
import { useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { BudgetBadge } from '@/components/budget'
import { budgetPercent, budgetRemaining, budgetState } from '@/lib/budget'
import { CategoryMedia } from '@/components/category-icon'
import { ResponsivePanel } from '@/components/responsive-panel'
import { LoadingRows } from '@/components/states'
import { TransactionItem } from '@/components/transaction-item'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Item, ItemContent, ItemGroup } from '@/components/ui/item'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { dayIso, dayLabel, money, monthLabel, shiftMonth } from '@/lib/format'
import { sumOf } from '@/lib/transactions'
import { moneyTooltip, monthTotals } from '@/lib/report'
import type { MonthlyReport } from '@/types'

export type ReportDetail =
  | { type: 'day'; day: number }
  | { type: 'category'; categoryId: string }
  | { type: 'month'; month: string }
  | null

/** Spending per category as bars. Rows are buttons when onSelect is given. */
export function CategoryBreakdown({ items, onSelect }: { items: MonthlyReport['byCategory']; onSelect?: (categoryId: string) => void }) {
  const { category } = useRefData()
  const total = items.reduce((s, c) => s + c.total, 0)
  const top = items[0]?.total ?? 1
  return (
    <div className="grid gap-1 [&_[data-slot=progress-indicator]]:bg-chart-2">
      {items.map(({ categoryId, total: amount }) => {
        const cat = category(categoryId)
        const bar = (
          <Progress value={Math.round((amount / top) * 100)} className="items-center">
            <ProgressLabel className="flex items-center gap-2"><CategoryMedia category={cat} />{cat?.name ?? 'Other'}</ProgressLabel>
            <span className="ml-auto text-sm tabular-nums">
              {money(amount, { whole: true })} <span className="text-muted-foreground">({Math.round((amount / total) * 100)}%)</span>
            </span>
          </Progress>
        )
        return (
          <Item
            key={categoryId}
            size="xs"
            className={onSelect ? '-mx-2 px-2 text-left hover:bg-muted' : '-mx-2 px-2'}
            render={onSelect ? <button type="button" onClick={() => onSelect(categoryId)} aria-label={`${cat?.name ?? 'Other'}: ${money(amount, { whole: true })}. Show details`} /> : undefined}
          >
            <ItemContent>{bar}</ItemContent>
          </Item>
        )
      })}
    </div>
  )
}

/** Everything spent on one day. */
export function DayDetail({ month, day, onClose }: { month: string; day: number; onClose: () => void }) {
  const date = dayIso(month, day)
  const { data } = useQuery(`tx:${month}`, () => api.transactions.list({ month }))
  const items = (data ?? []).filter((t) => t.date === date)
  const spent = sumOf(items, 'expense')
  return (
    <ResponsivePanel
      onClose={onClose}
      title={dayLabel(date)}
      description={spent ? `${money(spent)} spent this day` : 'Nothing spent this day'}
    >
      {!data ? <LoadingRows rows={3} /> : items.length ? (
        <ItemGroup className="pb-4">{items.map((t) => <TransactionItem key={t.id} t={t} />)}</ItemGroup>
      ) : (
        <p className="pb-4 text-sm text-muted-foreground">No transactions on this day.</p>
      )}
    </ResponsivePanel>
  )
}

const historyConfig = { spent: { label: 'Spent', color: 'var(--chart-2)' } } satisfies ChartConfig

/** One category: its total, budget, last six months, and this month's transactions. */
export function CategoryDetail({ month, categoryId, onClose }: { month: string; categoryId: string; onClose: () => void }) {
  const { category } = useRefData()
  const cat = category(categoryId)
  const { data: all } = useQuery(`cat-tx:${categoryId}`, () => api.transactions.list({ categoryId }))
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

  return (
    <ResponsivePanel
      onClose={onClose}
      title={cat?.name ?? 'Category'}
      description={`Spending in ${monthLabel(month)}`}
    >
      {!all ? <LoadingRows rows={4} /> : (
        <div className="grid gap-6 pb-4">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{money(total, { whole: true })}</p>
            {monthTotal > 0 && <p className="text-sm text-muted-foreground">{Math.round((total / monthTotal) * 100)}% of everything you spent this month</p>}
          </div>

          {budget && (
            <Progress value={budgetPercent(budget)}>
              <ProgressLabel>Budget {money(budget.limit, { whole: true })}</ProgressLabel>
              <span className="ml-auto flex items-center gap-2 text-sm tabular-nums">{budgetRemaining(budget)} <BudgetBadge state={budgetState(budget)} /></span>
            </Progress>
          )}

          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Last 6 months</h3>
            <ChartContainer config={historyConfig} className="aspect-auto h-40 w-full">
              <BarChart accessibilityLayer data={history}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(m) => monthLabel(m, 'short')} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(m) => monthLabel(String(m))} formatter={moneyTooltip(historyConfig)} />} />
                <Bar dataKey="spent" radius={4}>
                  {history.map((h) => <Cell key={h.month} fill="var(--color-spent)" fillOpacity={h.month === month ? 1 : 0.4} />)}
                </Bar>
              </BarChart>
            </ChartContainer>
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
      {!data || !totals ? <LoadingRows rows={4} /> : (
        <div className="grid gap-6 pb-4">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {monthTotals(totals.income, totals.spent).map(([label, value, tone]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className={`text-base font-semibold tabular-nums ${tone}`}>{money(value, { whole: true })}</dd>
              </div>
            ))}
          </dl>
          {data.byCategory.length
            ? <CategoryBreakdown items={data.byCategory} />
            : <p className="text-sm text-muted-foreground">No spending this month.</p>}
        </div>
      )}
    </ResponsivePanel>
  )
}
