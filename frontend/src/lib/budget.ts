import { money, todayIso } from './format.ts'
import type { Anomaly, AnomalyCheck, BudgetStatus, MonthlyReport, MonthSummary } from '@/types'

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
 */
export function outsideBudgets(budgets: Pick<BudgetStatus, 'categoryId' | 'spent' | 'limit'>[]) {
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

/**
 * The once-a-month part of a month (DSS feature 6): what's been paid in those categories, and how much of the monthly
 * budget they take. That's a category's own budget until the payment is bigger, so a bill not paid yet keeps its room;
 * one without a budget takes only what's been paid.
 */
export function fixedPart(fixed: MonthSummary['fixed'], budgets: Pick<BudgetStatus, 'categoryId' | 'limit'>[]) {
  let spent = 0
  let reserved = 0
  for (const f of fixed) {
    spent += f.total
    reserved += Math.max(f.total, budgets.find((b) => b.categoryId === f.categoryId)?.limit ?? 0)
  }
  return { spent, reserved }
}

/** The monthly budget with the once-a-month part taken out: everyday spending against the room left for it. */
export const everyday = <B extends Pick<BudgetStatus, 'spent' | 'limit'>>(b: B, f: ReturnType<typeof fixedPart>): B =>
  ({ ...b, spent: b.spent - f.spent, limit: b.limit - f.reserved })

/** Whether a budget needs a look: near, used up or over. A once-a-month one only when over: a bill paid in full is fine. */
export const needsLook = (b: Pick<BudgetStatus, 'spent' | 'limit' | 'warnAt'>, onceAMonth = false) =>
  onceAMonth ? budgetState(b) === 'over' : budgetState(b) !== 'ok'

/** Unusual purchases (DSS feature 9) join the once-a-month part: counted as spent once, never projected forward. */
export function withUnusual(f: ReturnType<typeof fixedPart>, unusual: Pick<Anomaly, 'amount'>[]) {
  const total = unusual.reduce((s, a) => s + a.amount, 0)
  return { spent: f.spent + total, reserved: f.reserved + total }
}

/** Why a saved purchase was flagged, with the usual range as it was when it was judged (it never changes later). */
export const unusualLine = (a: Pick<Anomaly, 'amount' | 'usualLow' | 'usualHigh'>, categoryName: string) =>
  a.usualLow !== null && a.usualHigh !== null
    ? `When it was saved, you usually spent ${money(a.usualLow, { whole: true })} to ${money(a.usualHigh, { whole: true })} on ${categoryName}. This one is ${money(a.amount, { whole: true })}.`
    : `This one is ${money(a.amount, { whole: true })}, far above your usual ${categoryName}.`

const ORDINAL = ['', '1st', '2nd', '3rd']
const ordinal = (n: number) => ORDINAL[n] ?? `${n}th`

/**
 * What the add form's verdict card says before saving (DSS feature 9): why it's unusual, what came before (an earlier
 * one-off like it; from the third on, a suggestion to make it a habit), and a likely same-day duplicate. Null: nothing.
 */
export function verdictCopy(c: AnomalyCheck, amount: number, categoryName: string) {
  const reason = c.unusual && c.usualLow !== null && c.usualHigh !== null
    ? `${money(amount, { whole: true })} is far above your usual ${categoryName} (${money(c.usualLow, { whole: true })} to ${money(c.usualHigh, { whole: true })}).`
    : null
  const duplicate = c.duplicate ? `You already added ${money(amount, { whole: true })} for ${categoryName} on this day. Is this a duplicate?` : null
  if (!reason && !duplicate) return null
  const suggestHabit = !!reason && c.similar.length >= 2
  const last = c.similar[0]
  const context = !reason || !last ? null
    : suggestHabit ? `This is your ${ordinal(c.similar.length + 1)} like this since ${shortDate(c.similar.at(-1)!.date)}. Make it part of your habits?`
    : `You had a one-off like this on ${shortDate(last.date)} (${money(last.amount, { whole: true })}).`
  return { reason, context, suggestHabit, duplicate }
}

/** The verdict card's number line, in % of its width on a log scale: the usual band, and where this amount falls. */
export function numberLine(low: number, high: number, amount: number) {
  const lo = Math.log(Math.min(low, amount) / 1.25)
  const hi = Math.log(Math.max(high, amount) * 1.25)
  const at = (x: number) => ((Math.log(x) - lo) / (hi - lo)) * 100
  return { bandLeft: at(low), bandWidth: at(high) - at(low), marker: at(amount) }
}

/** Says what the pace leaves out, next to it: once-a-month categories and unusual purchases. Null when nothing. */
export function leavesOut(names: string[], unusual: Pick<Anomaly, 'amount'>[] = []) {
  const parts = []
  if (names.length) parts.push(`${new Intl.ListFormat('en').format(names)} (paid once a month)`)
  if (unusual.length) {
    const total = money(unusual.reduce((s, a) => s + a.amount, 0), { whole: true })
    parts.push(`${unusual.length} unusual ${unusual.length === 1 ? 'purchase' : 'purchases'} (${total})`)
  }
  return parts.length ? `Leaves out ${parts.join(' and ')}.` : null
}

/** A once-a-month category's card line in its own month, in place of a pace: paid, or what's set aside for it. */
export const paidLine = (b: Pick<BudgetStatus, 'spent' | 'limit'>) =>
  b.spent > 0 ? `Paid ${money(b.spent, { whole: true })} this month.` : `Not paid yet. ${money(b.limit, { whole: true })} is set aside for it.`

/** Progress bar tone per state, matching the badge: red when over, default otherwise. */
export const OVER_BAR: Record<BudgetState, string> = { ok: '', near: '', used: '', over: '[&_[data-slot=progress-indicator]]:bg-destructive!' }

/**
 * The budgets a month had (from the report, so a finished month gets the ones it ended with, not today's), each with
 * what was spent against it: all spending for the monthly budget, its category's for a category budget.
 */
export function monthBudgets(report: Pick<MonthlyReport, 'byCategory' | 'budgets'>) {
  const total = report.byCategory.reduce((s, c) => s + c.total, 0)
  return report.budgets.map((b) => ({
    ...b,
    spent: b.categoryId === null ? total : (report.byCategory.find((c) => c.categoryId === b.categoryId)?.total ?? 0),
  }))
}
