import assert from 'node:assert/strict'
import test from 'node:test'
import { outsideBudgets } from './budget.ts'

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
