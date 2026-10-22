// The Reports charts, in their own file because recharts is most of the Reports download. Reports and its
// detail panels load this lazily, so the rest of the page (and the background page prefetch) doesn't wait on it.
import { memo } from 'react'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { money, monthLabel } from '@/lib/format'
import type { MonthlyReport } from '@/types'

const trendConfig = {
  income: { label: 'Income', color: 'var(--chart-1)' },
  spent: { label: 'Spending', color: 'var(--chart-2)' },
} satisfies ChartConfig

const paceConfig = {
  spent: { label: 'Spent so far', color: 'var(--chart-2)' },
  pace: { label: 'On-budget pace', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

const historyConfig = { spent: { label: 'Spent', color: 'var(--chart-2)' } } satisfies ChartConfig

/** Tooltip rows as "Label ₱1,234" using the chart's own labels. */
function moneyTooltip(config: ChartConfig) {
  return (value: unknown, name: unknown) => (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-muted-foreground">{config[String(name)]?.label}</span>
      <span className="font-medium tabular-nums">{money(Number(value), { whole: true })}</span>
    </div>
  )
}

// Recharts passes the hovered x value as activeLabel on chart clicks.
type ChartClick = { activeLabel?: string | number } | null

// memo: a panel opening re-renders Reports; charts redraw only when data or handler changes.
/** Running total per day against the on-budget pace line. onDay gets the tapped day. */
export const PaceChart = memo(function PaceChart({ data, onDay }: { data: { day: number; spent?: number; pace?: number }[]; onDay: (day: number) => void }) {
  const hasBudget = data.some((d) => d.pace !== undefined)
  return (
    <ChartContainer config={paceConfig} className="aspect-auto h-56 w-full cursor-pointer sm:h-64">
      <ComposedChart accessibilityLayer data={data} margin={{ left: 4, right: 8 }} onClick={(s: ChartClick) => onDay(Number(s?.activeLabel))}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `₱${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k`} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => `Day ${d}`} formatter={moneyTooltip(paceConfig)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area dataKey="spent" type="monotone" stroke="var(--color-spent)" strokeWidth={2} fill="var(--color-spent)" fillOpacity={0.15} connectNulls={false} />
        {hasBudget ? <Line dataKey="pace" type="linear" stroke="var(--color-pace)" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={false} /> : null}
      </ComposedChart>
    </ChartContainer>
  )
})

/** Income and spending bars per month. onMonth gets the tapped month. */
export const TrendChart = memo(function TrendChart({ data, onMonth }: { data: MonthlyReport['trend']; onMonth: (month: string) => void }) {
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full cursor-pointer">
      <BarChart accessibilityLayer data={data} onClick={(s: ChartClick) => { if (s?.activeLabel) onMonth(String(s.activeLabel)) }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={(m) => monthLabel(m, 'short')} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(m) => monthLabel(String(m))} formatter={moneyTooltip(trendConfig)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={4} />
        <Bar dataKey="spent" fill="var(--color-spent)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
})

/** One category's spending per month, with the selected month drawn solid. */
export function HistoryChart({ data, month }: { data: { month: string; spent: number }[]; month: string }) {
  return (
    <ChartContainer config={historyConfig} className="aspect-auto h-40 w-full">
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(m) => monthLabel(m, 'short')} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(m) => monthLabel(String(m))} formatter={moneyTooltip(historyConfig)} />} />
        <Bar dataKey="spent" radius={4}>
          {data.map((h) => <Cell key={h.month} fill="var(--color-spent)" fillOpacity={h.month === month ? 1 : 0.4} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
