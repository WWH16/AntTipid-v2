import assert from 'node:assert/strict'
import test from 'node:test'
import { categoryRows, printDate, printMonth, signedAmount } from './print-report.ts'

test('printMonth: a real month up to the current one, else the current one', () => {
  assert.equal(printMonth('2026-10', '2026-11'), '2026-10')
  for (const bad of [null, '', 'x', '2026-13', '2027-01']) assert.equal(printMonth(bad, '2026-11'), '2026-11')
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
