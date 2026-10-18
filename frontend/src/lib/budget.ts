import { money } from '@/lib/format'
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
