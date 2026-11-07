import { money, monthLabel } from './format.ts'
import type { MonthlyReport } from '@/types'

type TrendMonth = MonthlyReport['trend'][number]

const tracked = (m: TrendMonth) => m.income > 0 || m.spent > 0

/**
 * Earned, spent and saved (or short by, not "overspent": this isn't the budget) for a month: label, amount, a text colour
 * and a swatch. Amounts stay dark, with a swatch tying them to their chart series. Red is kept for coming up short.
 */
export function monthTotals(income: number, spent: number) {
  const saved = income - spent
  return [
    ['Earned', income, '', 'bg-chart-1'],
    ['Spent', spent, '', 'bg-chart-2'],
    [saved >= 0 ? 'Saved' : 'Short by', Math.abs(saved), saved >= 0 ? '' : 'text-destructive', ''],
  ] as const
}

/**
 * The line under each month total: earned and spent against the month before, saved as a share of income. A month still
 * going only names last month's figure, since part of a month is nearly always "less".
 */
export function totalNotes(trend: MonthlyReport['trend'], finished: boolean) {
  const [before, now] = trend.slice(-2)
  const against = (key: 'income' | 'spent') => {
    if (!tracked(before)) return null
    const name = monthLabel(before.month, 'short')
    if (!finished) return `${name}: ${money(before[key], { whole: true })}`
    const gap = Math.round(now[key] - before[key])
    return gap === 0 ? `Same as ${name}` : `${money(Math.abs(gap), { whole: true })} ${gap < 0 ? 'less' : 'more'} than ${name}`
  }
  const saved = now.income - now.spent
  return [against('income'), against('spent'), now.income > 0 && saved >= 0 ? `${Math.round((saved / now.income) * 100)}% of income` : null]
}

/** Saved per month for the Reports chart, shown from 2 months on, with no bar for a month with nothing recorded, and the total as a sentence. */
export function savedMonths(trend: MonthlyReport['trend']) {
  const rows = trend.map((m) => ({ month: m.month, saved: tracked(m) ? m.income - m.spent : null }))
  const count = trend.filter(tracked).length
  const total = rows.reduce((s, r) => s + (r.saved ?? 0), 0)
  return { rows, count, line: total >= 0 ? `You saved ${money(total, { whole: true })} in ${count} months` : `You came up ${money(-total, { whole: true })} short in ${count} months` }
}

/** Calendar shades, per day: 1 to 4 by rank among the days with spending, so one huge day leaves the rest readable. 0: nothing spent. */
export function heatLevels(daily: MonthlyReport['daily']) {
  const spends = daily.map((d) => d.spent).filter((v) => v > 0)
  return daily.map((d) => (d.spent > 0 ? Math.ceil((spends.filter((v) => v <= d.spent).length / spends.length) * 4) : 0))
}

/** A category's months as SVG points in a 60 by 15 box, from zero up. Null under 2 months of spending: no line to read. */
export function sparkPoints(totals: number[]) {
  if (totals.filter((v) => v > 0).length < 2) return null
  const top = Math.max(...totals)
  return totals.map((v, i) => `${(i / (totals.length - 1)) * 60},${14 - (v / top) * 13}`).join(' ')
}
