// The Reports charts, in their own file because recharts is most of the Reports download. Reports and its
// detail panels load this lazily, so the rest of the page (and the background page prefetch) doesn't wait on it.
import { memo } from 'react'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { money, monthLabel, pesoTick } from '@/lib/format'
import type { MonthlyReport } from '@/types'

const trendConfig = {
  income: { label: 'Income', color: 'var(--chart-1)' },
  spent: { label: 'Spending', color: 'var(--chart-2)' },
} satisfies ChartConfig

// Legend keys drawn like the lines they name: a colour square would make the dashed projection look like the solid area.
const LineKey = ({ color, dash }: { color: string; dash?: string }) => (
  <svg aria-hidden viewBox="0 0 12 12"><line x2="12" y1="6" y2="6" stroke={color} strokeWidth="2" strokeDasharray={dash} /></svg>
)

const paceConfig = {
  spent: { label: 'Spent', color: 'var(--chart-2)' },
  pace: { label: 'On budget', color: 'var(--muted-foreground)', icon: () => <LineKey color="var(--muted-foreground)" /> },
  projected: { label: 'At this pace', color: 'var(--chart-2)', icon: () => <LineKey color="var(--chart-2)" dash="4 3" /> },
} satisfies ChartConfig

const historyConfig = { spent: { label: 'Spent', color: 'var(--chart-2)' } } satisfies ChartConfig

const savedConfig = { saved: { label: 'Saved', color: 'var(--chart-1)' } } satisfies ChartConfig

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

/** A series' value beside its last point, in dark text with a card-coloured halo so it stays readable over the lines. */
function endLabel(at: number, text: string, below: boolean, anchor: 'start' | 'middle' | 'end' = 'end') {
  return function EndLabel({ x, y, index }: { x?: number | string; y?: number | string; index?: number }) {
    if (index !== at) return null
    return (
      <text x={x} y={Number(y) + (below ? 16 : -8)} textAnchor={anchor} fontSize={12} fontWeight={500} fill="var(--foreground)" stroke="var(--card)" strokeWidth={3} paintOrder="stroke" className="tabular-nums">
        {text}
      </text>
    )
  }
}

// memo: a panel opening re-renders Reports; charts redraw only when data or handler changes.
/** Running total per day against the on-budget pace line and where this pace is heading, with unusual purchases as dots. onDay gets the tapped day. */
export const PaceChart = memo(function PaceChart({ data, markers, onDay }: {
  data: { day: number; spent?: number; pace?: number; projected?: number }[]
  markers: { id: string; day: number; total: number }[]
  onDay: (day: number) => void
}) {
  const last = data.length - 1
  const end = data[last]
  const spentAt = data.filter((d) => d.spent !== undefined).length - 1
  const spent = data[spentAt]?.spent ?? 0
  const budget = end?.pace
  // What else ends at the right edge beside the budget. The lower of the two labels goes under its line, clear of the
  // higher line and label, unless that would crowd the axis.
  const other = end?.projected ?? (spentAt === last ? spent : undefined)
  const floor = Math.max(...data.flatMap((d) => [d.spent ?? 0, d.pace ?? 0, d.projected ?? 0])) * 0.15
  const budgetBelow = budget !== undefined && other !== undefined && other >= budget && budget > floor
  const otherBelow = budget !== undefined && other !== undefined && other < budget && other > floor
  return (
    <ChartContainer config={paceConfig} className="aspect-auto h-56 w-full cursor-pointer sm:h-64">
      <ComposedChart accessibilityLayer data={data} margin={{ top: 22, left: 4, right: 8 }} onClick={(s: ChartClick) => onDay(Number(s?.activeLabel))}>
        <CartesianGrid vertical={false} />
        {/* Every 7 days from the 1st, the same in every month, so the labels sit evenly on a phone. */}
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} ticks={[1, 8, 15, 22, 29]} interval={0} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={pesoTick} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => `Day ${d}`} formatter={moneyTooltip(paceConfig)} />} />
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
        {/* Steps, not a curve: a running total only changes when something is spent, and a curve draws amounts that never were. */}
        <Area
          dataKey="spent" type="stepAfter" stroke="var(--color-spent)" strokeWidth={2} fill="var(--color-spent)" fillOpacity={0.15} connectNulls={false}
          label={endLabel(spentAt, money(spent, { whole: true }), spentAt === last && otherBelow, spentAt > last - 4 ? 'end' : spentAt < 3 ? 'start' : 'middle')}
        />
        {budget !== undefined && (
          <Line
            dataKey="pace" type="linear" stroke="var(--color-pace)" strokeWidth={2} dot={false} activeDot={false}
            label={endLabel(last, `${money(budget, { whole: true })} budget`, budgetBelow)}
          />
        )}
        {/* Dashed only here: dashes mean a value that hasn't happened yet. */}
        {end?.projected !== undefined && (
          <Line
            dataKey="projected" type="linear" stroke="var(--color-projected)" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={false}
            label={endLabel(last, money(end.projected, { whole: true }), otherBelow)}
          />
        )}
        {markers.map((m) => <ReferenceDot key={m.id} x={m.day} y={m.total} r={5} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2} />)}
      </ComposedChart>
    </ChartContainer>
  )
})

/** Income and spending bars per month. onMonth gets the tapped month. */
export const TrendChart = memo(function TrendChart({ data, onMonth }: { data: MonthlyReport['trend']; onMonth: (month: string) => void }) {
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full cursor-pointer">
      <BarChart accessibilityLayer data={data} margin={{ top: 8, left: 4, right: 8 }} onClick={(s: ChartClick) => { if (s?.activeLabel) onMonth(String(s.activeLabel)) }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={(m) => monthLabel(m, 'short')} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={pesoTick} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(m) => monthLabel(String(m))} formatter={moneyTooltip(trendConfig)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="spent" fill="var(--color-spent)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
})

/** Income minus spending per month, up from zero when saved, down when short. onMonth gets the tapped month. */
export const SavedChart = memo(function SavedChart({ data, onMonth }: { data: { month: string; saved: number | null }[]; onMonth: (month: string) => void }) {
  return (
    <ChartContainer config={savedConfig} className="aspect-auto h-48 w-full cursor-pointer">
      <BarChart accessibilityLayer data={data} margin={{ top: 8, left: 4, right: 8 }} onClick={(s: ChartClick) => { if (s?.activeLabel) onMonth(String(s.activeLabel)) }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={(m) => monthLabel(m, 'short')} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={pesoTick} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(m) => monthLabel(String(m))} formatter={moneyTooltip(savedConfig)} />} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" />
        <Bar dataKey="saved" radius={[4, 4, 0, 0]}>
          {data.map((r) => <Cell key={r.month} fill={(r.saved ?? 0) < 0 ? 'var(--destructive)' : 'var(--color-saved)'} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
})

/** One category's spending per month, with the selected month drawn solid. */
export function HistoryChart({ data, month }: { data: { month: string; spent: number }[]; month: string }) {
  return (
    <ChartContainer config={historyConfig} className="aspect-auto h-40 w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 8, left: 4, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(m) => monthLabel(m, 'short')} />
        <YAxis tickLine={false} axisLine={false} width={44} tickCount={3} tickFormatter={pesoTick} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(m) => monthLabel(String(m))} formatter={moneyTooltip(historyConfig)} />} />
        <Bar dataKey="spent" radius={[4, 4, 0, 0]}>
          {data.map((h) => <Cell key={h.month} fill="var(--color-spent)" fillOpacity={h.month === month ? 1 : 0.4} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
