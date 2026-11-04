import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBackup } from './backup.ts'

const good = { app: 'anttipid', version: 1, exportedOn: '2026-11-04', wallets: [{}], categories: [{}, {}], transactions: [{}, {}, {}], budgets: [], budgetHistory: [] }

test('readBackup: counts what a good file holds', () => {
  assert.deepEqual(readBackup(JSON.stringify(good)), { exportedOn: '2026-11-04', wallets: 1, categories: 2, transactions: 3, budgets: 0 })
})

test('readBackup: refuses anything else', () => {
  const notOurs = /isn't an AntTipid backup/
  assert.throws(() => readBackup('not json'), notOurs)
  assert.throws(() => readBackup('null'), notOurs)
  assert.throws(() => readBackup('[]'), notOurs)
  assert.throws(() => readBackup(JSON.stringify({ ...good, app: 'other' })), notOurs)
  assert.throws(() => readBackup(JSON.stringify({ ...good, transactions: 'x' })), notOurs)
  assert.throws(() => readBackup(JSON.stringify({ ...good, version: 2 })), /newer version/)
})
