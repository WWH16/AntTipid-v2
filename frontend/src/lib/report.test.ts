import assert from 'node:assert/strict'
import test from 'node:test'
import { heatLevels, monthTotals, savedMonths, sparkPoints, totalNotes } from './report.ts'

const sep = { month: '2026-09', income: 24000, spent: 8300 }
const oct = { month: '2026-10', income: 27500, spent: 8095 }

test('monthTotals: dark amounts with a swatch for the two chart series, red only when short', () => {
  assert.deepEqual(monthTotals(27500, 8095), [
    ['Earned', 27500, '', 'bg-chart-1'],
    ['Spent', 8095, '', 'bg-chart-2'],
    ['Saved', 19405, '', ''],
  ])
  assert.deepEqual(monthTotals(100, 150)[2], ['Short by', 50, 'text-destructive', ''])
})

test('totalNotes: a finished month is compared with the month before', () => {
  assert.deepEqual(totalNotes([sep, oct], true), ['₱3,500 more than Sep', '₱205 less than Sep', '71% of income'])
  assert.deepEqual(totalNotes([sep, { ...sep, month: '2026-10' }], true).slice(0, 2), ['Same as Sep', 'Same as Sep'])
})

test('totalNotes: a month still going only names last month, since part of a month is always less', () => {
  assert.deepEqual(totalNotes([sep, oct], false), ['Sep: ₱24,000', 'Sep: ₱8,300', '71% of income'])
})

test('totalNotes: no comparison with an empty month, no share when short or without income', () => {
  const empty = { month: '2026-09', income: 0, spent: 0 }
  assert.deepEqual(totalNotes([empty, oct], true), [null, null, '71% of income'])
  assert.deepEqual(totalNotes([empty, { month: '2026-10', income: 100, spent: 150 }], true), [null, null, null])
  assert.deepEqual(totalNotes([empty, { month: '2026-10', income: 0, spent: 150 }], true), [null, null, null])
})

test('savedMonths: income minus spending, with no bar for a month with nothing recorded', () => {
  const { rows, count, line } = savedMonths([{ month: '2026-08', income: 0, spent: 0 }, sep, { month: '2026-10', income: 1000, spent: 1700 }])
  assert.deepEqual(rows, [{ month: '2026-08', saved: null }, { month: '2026-09', saved: 15700 }, { month: '2026-10', saved: -700 }])
  assert.equal(count, 2)
  assert.equal(line, 'You saved ₱15,000 in 2 months')
})

test('savedMonths: says short when the months come out behind', () => {
  assert.equal(savedMonths([{ month: '2026-09', income: 1000, spent: 1200 }, { month: '2026-10', income: 1000, spent: 1500 }]).line, 'You came up ₱700 short in 2 months')
})

test('heatLevels: 1 to 4 by rank among spending days, so one huge day leaves the rest readable, 0 for none', () => {
  const day = (spent: number, i: number) => ({ day: i + 1, spent })
  assert.deepEqual(heatLevels([100, 0, 200, 300, 90000].map(day)), [1, 0, 2, 3, 4])
  assert.deepEqual(heatLevels([100, 100].map(day)), [4, 4])
  assert.deepEqual(heatLevels([0, 0].map(day)), [0, 0])
})

test('sparkPoints: six months on a shared zero baseline, nothing with fewer than 2 months of spending', () => {
  assert.equal(sparkPoints([0, 0, 500, 1000, 0, 250]), '0,14 12,14 24,7.5 36,1 48,14 60,10.75')
  assert.equal(sparkPoints([0, 0, 0, 0, 0, 250]), null)
  assert.equal(sparkPoints([]), null)
})
