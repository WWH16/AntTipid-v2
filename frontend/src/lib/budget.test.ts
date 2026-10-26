import assert from 'node:assert/strict'
import test from 'node:test'
import { budgetState, outsideBudgets, pace, paceLine, vsUsual } from './budget.ts'

const budget = (categoryId: string | null, limit: number, spent: number) => ({ id: String(categoryId), categoryId, limit, spent, warnAt: 80 })

test('outsideBudgets: spending without a category budget, against what the month leaves unassigned', () => {
  // ₱10,000 month, ₱8,000 assigned: ₱2,000 room. ₱9,500 spent, ₱6,000 of it in budgeted categories.
  assert.deepEqual(
    outsideBudgets([budget(null, 10000, 9500), budget('food', 5000, 4000.1), budget('load', 3000, 1999.9)]),
    { spent: 3500, room: 2000, total: 9500 },
  )
  // Every peso assigned: any outside spending is past the room.
  assert.deepEqual(outsideBudgets([budget(null, 10000, 10400), budget('food', 10000, 10000)]), { spent: 400, room: 0, total: 10400 })
  // Nothing is outside without both a monthly budget and a category budget.
  assert.equal(outsideBudgets([budget(null, 10000, 500)]), null)
  assert.equal(outsideBudgets([budget('food', 5000, 500)]), null)
})

test('pace: run-out day and safe daily amount, or what is left over', () => {
  // ₱20,000 month, ₱11,550 spent by Oct 15: ₱770 a day, so ₱8,450 lasts to Oct 26 (5 days early); ₱497 a day over the 17 days left, today included.
  assert.deepEqual(pace({ spent: 11550, limit: 20000 }, '2026-10', '2026-10-15'), { lasts: false, runsOut: '2026-10-26', early: 5, perDay: 8450 / 17 })
  // ₱5,000 spent by the 15th of a ₱20,000 month: lasts, ₱20,000 - ₱5,000 - 16 × ₱333.33 left over.
  assert.equal(pace({ spent: 5000, limit: 20000 }, '2026-10', '2026-10-15')?.lasts, true)
  // Nothing to say before day 5, for a past month, or once over.
  assert.equal(pace({ spent: 900, limit: 1000 }, '2026-10', '2026-10-04'), null)
  assert.equal(pace({ spent: 900, limit: 1000 }, '2026-09', '2026-10-15'), null)
  assert.equal(pace({ spent: 1200, limit: 1000 }, '2026-10', '2026-10-15'), null)
  // The monthly budget wins: a category that lasts still says when the month runs out.
  const monthly = budget(null, 20000, 11550)
  assert.match(paceLine(budget('food', 5000, 1000), '2026-10', monthly, '2026-10-15')!, /^On track, but your monthly budget runs out first, on Oct 26\.$/)
  assert.equal(paceLine(monthly, '2026-10', monthly, '2026-10-15'), 'Spending fast. At this pace it runs out Oct 26, 5 days before month-end. Keep to ₱497 a day to last the month.')
  // Lasts the month: what's left over at month-end.
  assert.equal(paceLine({ spent: 10000, limit: 20000 }, '2026-10', undefined, '2026-10-25'), 'On track. You should reach month-end with ₱7,600 to spare.')
  // Nothing spent yet: what the budget allows a day, from day 1 (₱20,000 over Oct 1-31).
  assert.equal(paceLine({ spent: 0, limit: 20000 }, '2026-10', undefined, '2026-10-01'), "Nothing spent yet. That's ₱645 a day for the rest of the month.")
  // A new category with nothing spent still hears first that the monthly budget runs out.
  assert.match(paceLine(budget('shop', 3000, 0), '2026-10', monthly, '2026-10-15')!, /^On track, but your monthly budget runs out first/)
  // Used up: no "₱0 a day" target. ₱200 of ₱200 load on Oct 25, and ₱3 left of ₱60.
  assert.equal(paceLine({ spent: 200, limit: 200 }, '2026-10', undefined, '2026-10-25'), 'All used up, with 7 days to month-end. Anything more this month goes over.')
  assert.equal(paceLine({ spent: 57, limit: 60 }, '2026-10', undefined, '2026-10-25'), 'Almost used up: ₱3 left for 7 days to month-end.')
})

test('budgetState: exactly at the limit is used up, not near it', () => {
  assert.equal(budgetState({ spent: 200, limit: 200, warnAt: 80 }), 'used')
  assert.equal(budgetState({ spent: 199.999999, limit: 200, warnAt: 80 }), 'used')
  assert.equal(budgetState({ spent: 190, limit: 200, warnAt: 80 }), 'near')
  assert.equal(budgetState({ spent: 201, limit: 200, warnAt: 80 }), 'over')
})

test('vsUsual: a finished month against the usual one, and what moved it most', () => {
  const usual = [{ categoryId: 'food', total: 6000 }, { categoryId: 'shop', total: 2500 }, { categoryId: 'trans', total: 1500 }]
  // Food ₱1,200 under, Shopping ₱800 under, Transport ₱250 over: ₱1,750 saved, mostly Food.
  const month = [{ categoryId: 'food', total: 4800 }, { categoryId: 'shop', total: 1700 }, { categoryId: 'trans', total: 1750 }]
  assert.deepEqual(vsUsual(month, usual), { saved: 1750, top: { categoryId: 'food', diff: 1200 } })
  // Spent more overall: the category that went over most. A usual category with no spending counts as all saved.
  assert.deepEqual(vsUsual([{ categoryId: 'food', total: 9000 }], usual.slice(0, 1)), { saved: -3000, top: { categoryId: 'food', diff: -3000 } })
  assert.equal(vsUsual(month, []), null)
})
