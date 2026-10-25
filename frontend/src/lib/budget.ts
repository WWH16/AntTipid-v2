import { money } from './format.ts'
import type { BudgetStatus } from '@/types'

export type BudgetState = 'ok' | 'near' | 'over'

export function budgetState(b: Pick<BudgetStatus, 'spent' | 'limit' | 'warnAt'>): BudgetState {
  if (b.spent > b.limit) return 'over'
  if (b.spent >= (b.limit * b.warnAt) / 100) return 'near'
  return 'ok'
}

export const budgetPercent = (b: Pick<BudgetStatus, 'spent' | 'limit'>) =>
  b.limit > 0 ? Math.min(100, Math.round((b.spent / b.limit) * 100)) : 0

/** "₱340 left" / "₱300 over". */
export function budgetRemaining(b: Pick<BudgetStatus, 'spent' | 'limit'>) {
  const left = b.limit - b.spent
  return left >= 0 ? `${money(left, { whole: true })} left` : `${money(-left, { whole: true })} over`
}

/**
 * Spending in categories without a budget of their own, and the room the monthly budget leaves for it: whatever
 * isn't assigned to a category. Spending past that room is what pushes the month over while every category
 * budget can still be on track. Null without a monthly budget or any category budget, since then nothing is outside.
 * Budgets aren't kept per month, so a past month is read against today's budgets.
 */
export function outsideBudgets(budgets: BudgetStatus[]) {
  const monthly = budgets.find((b) => b.categoryId === null)
  const parts = budgets.filter((b) => b.categoryId !== null)
  if (!monthly || !parts.length) return null
  const sum = (key: 'spent' | 'limit') => parts.reduce((s, b) => s + b[key], 0)
  // Cents, so float sums of pesos don't leave a stray ₱0.0000001.
  const cents = (n: number) => Math.round(n * 100) / 100
  return { spent: cents(monthly.spent - sum('spent')), room: cents(monthly.limit - sum('limit')), total: monthly.spent }
}

/** Progress bar tone per state, matching the badge: red when over, default otherwise. */
export const OVER_BAR: Record<BudgetState, string> = { ok: '', near: '', over: '[&_[data-slot=progress-indicator]]:bg-destructive!' }
