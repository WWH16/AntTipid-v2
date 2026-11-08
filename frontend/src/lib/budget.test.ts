import assert from 'node:assert/strict'
import test from 'node:test'
import { budgetState, endLine, everyday, fixedPart, leavesOut, monthBudgets, numberLine, verdictCopy, outsideBudgets, pace, paceHeadline, paceLine, projection, remainingOfLimit, unusualLine, withUnusual } from './budget.ts'

const budget = (categoryId: string | null, limit: number, spent: number) => ({ id: String(categoryId), categoryId, limit, spent, warnAt: 80 })

// spent, limit, month, today, expected. The same table is in backend/test_notifications.py, so email and screen agree.
const RUN_OUT: [number, number, string, string, string | null][] = [
  [6000, 10000, '2026-11', '2026-11-10', '2026-11-17'],
  [1000, 10000, '2026-11', '2026-11-10', null],
  [6000, 10000, '2026-11', '2026-11-04', null],
  [11000, 10000, '2026-11', '2026-11-10', null],
  [0, 10000, '2026-11', '2026-11-10', null],
  [6000, 10000, '2026-10', '2026-11-10', null],
  [3000, 9000, '2026-11', '2026-11-10', null],
  [7000, 10000, '2026-02', '2026-02-14', '2026-02-20'],
]

test('pace: the run-out date matches the table in backend/test_notifications.py', () => {
  for (const [spent, limit, month, today, want] of RUN_OUT) {
    const p = pace({ spent, limit }, month, today)
    assert.equal(p && !p.lasts ? p.runsOut : null, want)
  }
})

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
  // Lasts with nothing over: ₱100 a day uses all of ₱3,100, so no "₱0 to spare".
  assert.equal(paceLine({ spent: 1500, limit: 3100 }, '2026-10', undefined, '2026-10-15'), "On track. You'll just make it to month-end.")
  // Runs out during the last day: no "0 days before month-end". ₱1,550 at ₱100 a day lasts to day 30.5.
  assert.equal(paceLine({ spent: 1500, limit: 3050 }, '2026-10', undefined, '2026-10-15'), 'Spending fast. At this pace it runs out on Oct 31, the last day. Keep to ₱91 a day to last the month.')
  // Nothing spent yet: what the budget allows a day, from day 1 (₱20,000 over Oct 1-31).
  assert.equal(paceLine({ spent: 0, limit: 20000 }, '2026-10', undefined, '2026-10-01'), "Nothing spent yet. That's ₱645 a day for the rest of the month.")
  // A new category with nothing spent still hears first that the monthly budget runs out.
  assert.match(paceLine(budget('shop', 3000, 0), '2026-10', monthly, '2026-10-15')!, /^On track, but your monthly budget runs out first/)
  // Used up: no "₱0 a day" target. ₱200 of ₱200 load on Oct 25, and ₱3 left of ₱60.
  assert.equal(paceLine({ spent: 200, limit: 200 }, '2026-10', undefined, '2026-10-25'), 'All used up, with 7 days to month-end. Anything more this month goes over.')
  assert.equal(paceLine({ spent: 57, limit: 60 }, '2026-10', undefined, '2026-10-25'), 'Almost used up: ₱3 left for 7 days to month-end.')
})

test('paceLine: bills and one-offs that take the whole budget leave no room, not a negative a day', () => {
  // ₱5,000 budget; ₱3,000 rent paid and ₱3,000 tuition set aside: everyday spending ₱0 against -₱1,000.
  const e = everyday({ spent: 3000, limit: 5000 }, fixedPart([{ categoryId: 'rent', total: 3000 }, { categoryId: 'tuition', total: 0 }], [{ categoryId: 'tuition', limit: 3000 }]))
  assert.deepEqual(e, { spent: 0, limit: -1000 })
  assert.equal(paceLine(e, '2026-11', undefined, '2026-11-10'), 'Nothing left for everyday spending: bills and one-offs already use this budget.')
})

test('pace on the last day of the month: today is the one day left', () => {
  // Nov 30: ₱9,600 of ₱10,000 spent. No days are left to project, so it lasts with ₱400 over, not "0 days".
  assert.deepEqual(pace({ spent: 9600, limit: 10000 }, '2026-11', '2026-11-30'), { lasts: true, spare: 400 })
  assert.equal(paceLine({ spent: 9600, limit: 10000 }, '2026-11', undefined, '2026-11-30'), 'On track. You should reach month-end with ₱400 to spare.')
  assert.equal(paceLine({ spent: 10000, limit: 10000 }, '2026-11', undefined, '2026-11-30'), 'All used up, with 1 day to month-end. Anything more this month goes over.')
  // A short month ends on its own last day: Feb 28, 2027.
  assert.deepEqual(pace({ spent: 2800, limit: 3000 }, '2027-02', '2027-02-28'), { lasts: true, spare: 200 })
})

test('budgetState: exactly at the limit is used up, not near it', () => {
  assert.equal(budgetState({ spent: 200, limit: 200, warnAt: 80 }), 'used')
  assert.equal(budgetState({ spent: 199.999999, limit: 200, warnAt: 80 }), 'used')
  assert.equal(budgetState({ spent: 190, limit: 200, warnAt: 80 }), 'near')
  assert.equal(budgetState({ spent: 201, limit: 200, warnAt: 80 }), 'over')
})

test('monthBudgets: each budget the month had, with what was spent against it', () => {
  const report = {
    byCategory: [{ categoryId: 'food', total: 4800 }, { categoryId: 'trans', total: 1750 }],
    budgets: [{ categoryId: null, limit: 10000 }, { categoryId: 'food', limit: 5000 }, { categoryId: 'shop', limit: 1000 }],
  }
  // Monthly: all ₱6,550 spent. Food its own ₱4,800. Shopping had a budget but no spending.
  assert.deepEqual(monthBudgets(report), [
    { categoryId: null, limit: 10000, spent: 6550 },
    { categoryId: 'food', limit: 5000, spent: 4800 },
    { categoryId: 'shop', limit: 1000, spent: 0 },
  ])
  // Feeds the outside-budget flag: ₱1,750 of ₱6,550 outside, with ₱4,000 unassigned room.
  assert.deepEqual(outsideBudgets(monthBudgets(report)), { spent: 1750, room: 4000, total: 6550 })
})

test('fixedPart: rent paid once a month no longer reads as spending fast', () => {
  const month = '2026-10'
  const today = '2026-10-15'
  const monthly = budget(null, 20000, 11000)
  const rent = budget('rent', 8000, 8000)
  // Rent (₱8,000, paid on the 3rd) counted as pace: ₱11,000 in 15 days looks like it runs out on the 28th.
  assert.match(paceLine(monthly, month, undefined, today)!, /^Spending fast\. At this pace it runs out Oct 28/)
  // Left out: ₱3,000 everyday spending against the ₱12,000 not set aside for rent is ₱200 a day, ₱5,800 to spare.
  const paid = fixedPart([{ categoryId: 'rent', total: 8000 }], [monthly, rent])
  assert.deepEqual(paid, { spent: 8000, reserved: 8000 })
  assert.equal(paceLine(everyday(monthly, paid), month, undefined, today), 'On track. You should reach month-end with ₱5,800 to spare.')
  // Not paid yet: its ₱8,000 budget is still set aside, so the room is the same, not ₱8,000 bigger.
  const unpaid = fixedPart([{ categoryId: 'rent', total: 0 }], [budget(null, 20000, 3000), budget('rent', 8000, 0)])
  assert.deepEqual(unpaid, { spent: 0, reserved: 8000 })
  assert.equal(paceLine(everyday(budget(null, 20000, 3000), unpaid), month, undefined, today), 'On track. You should reach month-end with ₱5,800 to spare.')
  // No budget of its own: only what's been paid comes out.
  assert.deepEqual(fixedPart([{ categoryId: 'bills', total: 1200 }], [monthly]), { spent: 1200, reserved: 1200 })
})

test('unusual purchases: the reason, counted once in the pace, and said so', () => {
  const dinner = { transactionId: 'd', categoryId: 'food', amount: 4500, method: 'kmeans' as const, usualLow: 85, usualHigh: 450 }
  assert.equal(unusualLine(dinner, 'Food & dining'), 'When it was saved, you usually spent ₱85 to ₱450 on Food & dining. This one is ₱4,500.')
  // Added to the once-a-month part: spent and set aside, so the pace runs on everything else.
  assert.deepEqual(withUnusual({ spent: 8000, reserved: 8000 }, [dinner]), { spent: 12500, reserved: 12500 })
  // The ₱4,500 dinner on the 15th made ₱11,000 look like spending fast; left out, ₱6,500 lasts.
  const monthly = budget(null, 20000, 11000)
  const f = withUnusual(fixedPart([], [monthly]), [dinner])
  assert.equal(paceLine(everyday(monthly, f), '2026-10', undefined, '2026-10-15'), 'On track. You should reach month-end with ₱2,067 to spare.')
  assert.equal(leavesOut(['Rent'], [dinner]), 'Leaves out Rent (paid once a month) and 1 unusual purchase (₱4,500).')
  assert.equal(leavesOut([], [dinner, { ...dinner, amount: 1500 }]), 'Leaves out 2 unusual purchases (₱6,000).')
  assert.equal(leavesOut([], []), null)
})

test('verdictCopy: the reason, what came before, and when to suggest a habit', () => {
  const check = { unusual: true, method: 'kmeans' as const, usualLow: 87, usualHigh: 447, similar: [], duplicate: false }
  const first = verdictCopy(check, 4500, 'Food & dining')!
  assert.equal(first.reason, '₱4,500 is far above your usual Food & dining (₱87 to ₱447).')
  assert.equal(first.context, null)
  assert.equal(first.suggestHabit, false)
  const one = [{ transactionId: 'a', date: '2026-10-18', amount: 4500 }]
  assert.equal(verdictCopy({ ...check, similar: one }, 4400, 'Food & dining')!.context, 'You had a one-off like this on Oct 18 (₱4,500).')
  // A third like it is a pattern: suggest making it a habit (the form's default flips to "normal").
  const two = [...one, { transactionId: 'b', date: '2026-08-20', amount: 4300 }]
  const third = verdictCopy({ ...check, similar: two }, 4600, 'Food & dining')!
  assert.equal(third.context, 'This is your 3rd like this since Aug 20. Make it part of your habits?')
  assert.equal(third.suggestHabit, true)
  // A same-day duplicate is said even when the amount is usual.
  const dup = verdictCopy({ ...check, unusual: false, duplicate: true }, 150, 'Food & dining')!
  assert.equal(dup.reason, null)
  assert.equal(dup.duplicate, 'You already added ₱150 for Food & dining on this day. Is this a duplicate?')
  assert.equal(verdictCopy({ ...check, unusual: false }, 150, 'Food & dining'), null)
})

test('numberLine: the usual band and where this amount falls, on a log scale', () => {
  const far = numberLine(87, 447, 4500)
  assert.ok(far.bandLeft >= 0 && far.bandLeft + far.bandWidth < far.marker && far.marker <= 100)
  const inside = numberLine(87, 447, 200)
  assert.ok(inside.marker > inside.bandLeft && inside.marker < inside.bandLeft + inside.bandWidth)
})

test('endLine: how a finished month ended', () => {
  assert.equal(endLine({ limit: 1000, spent: 800 }), 'You stayed ₱200 under your ₱1,000 monthly budget.')
  assert.equal(endLine({ limit: 1000, spent: 1200 }), 'You went ₱200 over your ₱1,000 monthly budget.')
  assert.equal(endLine({ limit: 1000, spent: 1000 }), 'You used your whole ₱1,000 monthly budget.')
})

test('remainingOfLimit: what is left of a budget, or how far past it', () => {
  assert.equal(remainingOfLimit({ spent: 660, limit: 1000 }), '₱340 left of ₱1,000')
  assert.equal(remainingOfLimit({ spent: 1040, limit: 1000 }), '₱40 over ₱1,000')
})

test('paceHeadline: where the running total stands against the on-budget line', () => {
  assert.equal(paceHeadline(1500, 2000), '₱500 under pace so far')
  assert.equal(paceHeadline(2800, 2000), '₱800 over pace so far')
  assert.equal(paceHeadline(2000.4, 2000), 'Right on pace so far')
})

test('projection: the running total at this pace, crossing the limit on the run-out date', () => {
  const none = { spent: 0, reserved: 0 }
  const line = projection({ spent: 6000, limit: 10000 }, none, '2026-11', '2026-11-10')!
  assert.deepEqual([line[9], line[10], line[16], line[17], line[30]], [undefined, 6000, 9600, 10200, 18000])
  // Same as pace(): 2026-11-17 is the first day past the limit.
  const p = pace({ spent: 6000, limit: 10000 }, '2026-11', '2026-11-10')!
  assert.equal(!p.lasts && p.runsOut, '2026-11-17')
})

test('projection: a bill not paid yet joins once, the everyday pace carries on, and the end matches what pace() spares', () => {
  // ₱2,000 paid of a ₱3,000 bill: ₱1,000 still to come. Everyday: ₱1,000 in 10 days against ₱7,000.
  const fixed = { spent: 2000, reserved: 3000 }
  const line = projection({ spent: 3000, limit: 10000 }, fixed, '2026-11', '2026-11-10')!
  assert.equal(line[10], 3000)
  assert.equal(line[11], 4100)
  assert.equal(line[30], 6000)
  const p = pace(everyday({ spent: 3000, limit: 10000 }, fixed), '2026-11', '2026-11-10')!
  assert.equal(p.lasts && p.spare, 10000 - line[30])
})

test('projection: nothing to project for a finished month, the first days, the last day, or a budget already over', () => {
  const none = { spent: 0, reserved: 0 }
  assert.equal(projection({ spent: 6000, limit: 10000 }, none, '2026-11', '2026-11-30'), null)
  assert.equal(projection({ spent: 6000, limit: 10000 }, none, '2026-10', '2026-11-10'), null)
  assert.equal(projection({ spent: 6000, limit: 10000 }, none, '2026-11', '2026-11-04'), null)
  assert.equal(projection({ spent: 11000, limit: 10000 }, none, '2026-11', '2026-11-10'), null)
})
