import type { ChartConfig } from '@/components/ui/chart'
import { money } from '@/lib/format'

/** Earned, spent and saved (or overspent) for a month, with the tone each figure uses. */
export function monthTotals(income: number, spent: number) {
  const saved = income - spent
  return [
    ['Earned', income, 'text-chart-1'],
    ['Spent', spent, 'text-chart-2'],
    [saved >= 0 ? 'Saved' : 'Overspent', Math.abs(saved), saved >= 0 ? 'text-primary' : 'text-destructive'],
  ] as const
}

/** Tooltip rows as "Label ₱1,234" using the chart's own labels. */
export function moneyTooltip(config: ChartConfig) {
  return (value: unknown, name: unknown) => (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-muted-foreground">{config[String(name)]?.label}</span>
      <span className="font-medium tabular-nums">{money(Number(value), { whole: true })}</span>
    </div>
  )
}
