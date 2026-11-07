import assert from 'node:assert/strict'
import test from 'node:test'
import { bulletRows, categoryRows, printDate, signedAmount } from './print-report.ts'

test('bulletRows: bars and budget ticks share one peso scale, without the monthly budget', () => {
  const rows = bulletRows({
    byCategory: [{ categoryId: 'food', total: 750 }, { categoryId: 'load', total: 250 }],
    budgets: [{ categoryId: null, limit: 2000 }, { categoryId: 'food', limit: 500 }, { categoryId: 'gas', limit: 1000 }],
  }, String)
  assert.deepEqual(rows.map((r) => [r.id, r.bar, r.tick]), [['food', 75, 50], ['load', 25, null], ['gas', 0, 100]])
  assert.deepEqual(bulletRows({ byCategory: [], budgets: [] }, String), [])
})

test('categoryRows: spending first, then budgets with no spending', () => {
  const rows = categoryRows({
    byCategory: [{ categoryId: 'food', total: 750 }, { categoryId: 'load', total: 250 }],
    budgets: [{ categoryId: null, limit: 2000 }, { categoryId: 'food', limit: 500 }, { categoryId: 'gas', limit: 300 }],
  }, (id) => id.toUpperCase())
  assert.deepEqual(rows, [
    { id: 'food', name: 'FOOD', spent: 750, share: 75, limit: 500, left: -250 },
    { id: 'load', name: 'LOAD', spent: 250, share: 25, limit: null, left: null },
    { id: 'gas', name: 'GAS', spent: 0, share: 0, limit: 300, left: 300 },
  ])
  assert.deepEqual(categoryRows({ byCategory: [], budgets: [] }, String), [])
})

test('signedAmount: income up, expense down, transfer neither', () => {
  assert.equal(signedAmount('income', 100), '+₱100.00')
  assert.equal(signedAmount('expense', 100), '−₱100.00')
  assert.equal(signedAmount('transfer', 100), '₱100.00')
})

test('printDate: the plain date, whatever the device time zone', () => {
  assert.equal(printDate('2026-11-04'), 'Nov 4')
  assert.equal(printDate('2026-01-31'), 'Jan 31')
})
