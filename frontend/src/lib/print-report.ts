import { money } from './format.ts'
import type { MonthlyReport, TransactionKind } from '@/types'

/** The month to print: ?month when it is a real month up to the current one, else the current one. */
export function printMonth(param: string | null, current: string) {
  return param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) && param <= current ? param : current
}

/** One row per category with spending, then each category budget with none, so an unused budget still shows. */
export function categoryRows(report: Pick<MonthlyReport, 'byCategory' | 'budgets'>, nameOf: (id: string) => string) {
  const total = report.byCategory.reduce((s, c) => s + c.total, 0)
  const row = (id: string, spent: number) => {
    const limit = report.budgets.find((b) => b.categoryId === id)?.limit ?? null
    return { name: nameOf(id), spent, share: total ? Math.round((spent / total) * 100) : 0, limit, left: limit === null ? null : limit - spent }
  }
  return [
    ...report.byCategory.map((c) => row(c.categoryId, c.total)),
    ...report.budgets
      .filter((b) => b.categoryId !== null && !report.byCategory.some((c) => c.categoryId === b.categoryId))
      .map((b) => row(b.categoryId!, 0)),
  ]
}

/** Income up, expense down, a transfer neither. */
export const signedAmount = (kind: TransactionKind, amount: number) =>
  `${kind === 'income' ? '+' : kind === 'expense' ? '−' : ''}${money(amount)}`
