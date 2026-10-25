import { money, todayIso } from './format.ts'
import type { BudgetStatus } from '@/types'

export type BudgetState = 'ok' | 'near' | 'used' | 'over'

export function budgetState(b: Pick<BudgetStatus, 'spent' | 'limit' | 'warnAt'>): BudgetState {
  if (b.spent > b.limit) return 'over'
  // Exactly at the limit (to the centavo: sums of pesos can land a hair under it).
  if (b.limit - b.spent < 0.005) return 'used'
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

const daysIn = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()

/**
 * A budget at this month's pace (spent so far ÷ days so far): the day it runs out and what's safe to spend a day to
 * last the month, or what's left over if it lasts. Null when there's nothing to say: a past month, before day 5 (too
 * few days to go on), or already over (the badge says so).
 * ponytail: one big one-off inflates the pace; DSS feature 6 (paid once a month) and 9 (anomalies) leave those out.
 */
export function pace(b: Pick<BudgetStatus, 'spent' | 'limit'>, month: string, today = todayIso()) {
  const day = Number(today.slice(8))
  if (month !== today.slice(0, 7) || day < 5 || b.spent > b.limit) return null
  const days = daysIn(month)
  const left = b.limit - b.spent
  const perDay = b.spent / day
  const out = perDay > 0 ? day + left / perDay : Infinity // the day the money left reaches zero
  if (out >= days) return { lasts: true as const, spare: left - perDay * (days - day) }
  const runsOut = Math.ceil(out)
  // Per day over the days left, today included (it isn't over yet), the same way Home's card counts them.
  return { lasts: false as const, runsOut: `${month}-${String(runsOut).padStart(2, '0')}`, early: days - runsOut, perDay: left / (days - day + 1) }
}

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

/**
 * The pace as one line, for a budget card and Home's card. The monthly budget is the real limit, so a category card
 * says so when the monthly budget runs out first, even if the category itself would last. A budget with nothing spent
 * yet (newly set, or early in the month) has no pace, so it gets what it allows a day instead, from day 1.
 */
export function paceLine(b: Pick<BudgetStatus, 'spent' | 'limit'>, month: string, monthly?: BudgetStatus, today = todayIso()) {
  const p = pace(b, month, today)
  const m = monthly && monthly !== b ? pace(monthly, month, today) : null
  if (p && m && !m.lasts && (p.lasts || m.runsOut < p.runsOut)) {
    return p.lasts
      ? `On track, but your monthly budget runs out first, on ${shortDate(m.runsOut)}.`
      : `Your monthly budget runs out first, on ${shortDate(m.runsOut)}.`
  }
  const current = month === today.slice(0, 7)
  const daysLeft = daysIn(month) - Number(today.slice(8)) + 1 // today included, as above
  const span = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to month-end`
  if (current && b.spent === 0) return `Nothing spent yet. That's ${money(b.limit / daysLeft, { whole: true })} a day for the rest of the month.`
  // Fully or nearly used up: a daily target would read "₱0 a day", so say where it stands instead.
  const left = b.limit - b.spent
  if (current && budgetState({ ...b, warnAt: 100 }) === 'used') return `All used up, with ${span}. Anything more this month goes over.`
  if (p && !p.lasts && p.perDay < 1) return `Almost used up: ${money(left, { whole: true })} left for ${span}.`
  if (!p) return null
  if (p.lasts) return `On track. You should reach month-end with ${money(p.spare, { whole: true })} to spare.`
  return `Spending fast. At this pace it runs out ${shortDate(p.runsOut)}, ${p.early} ${p.early === 1 ? 'day' : 'days'} before month-end. Keep to ${money(p.perDay, { whole: true })} a day to last the month.`
}

/** Progress bar tone per state, matching the badge: red when over, default otherwise. */
export const OVER_BAR: Record<BudgetState, string> = { ok: '', near: '', used: '', over: '[&_[data-slot=progress-indicator]]:bg-destructive!' }

/**
 * A finished month against the usual one, over the categories that have a usual month: how much less (positive) or
 * more (negative) was spent, and the category that moved it most in that direction.
 */
export function vsUsual(byCategory: { categoryId: string; total: number }[], usual: { categoryId: string; total: number }[]) {
  if (!usual.length) return null
  const diffs = usual.map((u) => ({ categoryId: u.categoryId, diff: u.total - (byCategory.find((c) => c.categoryId === u.categoryId)?.total ?? 0) }))
  const saved = diffs.reduce((s, d) => s + d.diff, 0)
  const top = diffs.reduce((a, b) => (saved >= 0 ? b.diff > a.diff : b.diff < a.diff) ? b : a)
  return { saved, top }
}
