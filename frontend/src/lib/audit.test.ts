import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditDay, auditLine, auditTime } from './audit.ts'

const entry = (e: object) => ({ action: 'update', entity: 'transaction', label: 'Lunch', changes: null, ...e }) as never
const details = (e: object) => auditLine(entry(e)).details

test('auditLine: titles', () => {
  assert.deepEqual(auditLine(entry({ action: 'create', entity: 'budget', label: 'Monthly budget' })), { title: 'Added budget: Monthly budget', details: [] })
  assert.deepEqual(auditLine(entry({ action: 'delete', entity: 'wallet', label: 'GCash' })), { title: 'Deleted wallet: GCash', details: [] })
  assert.deepEqual(auditLine(entry({ action: 'create', label: '' })), { title: 'Added transaction', details: [] })
  assert.deepEqual(auditLine(entry({ action: 'sign_in', entity: 'account', label: '' })), { title: 'Signed in', details: [] })
  assert.deepEqual(auditLine(entry({ action: 'restore', entity: 'account', label: '245 transactions' })), { title: 'Restored a backup', details: ['245 transactions'] })
})

test('auditLine: what changed, one line each, in reading order', () => {
  assert.deepEqual(details({ changes: { note: ['', 'hi'], amount: [250, 300] } }), ['Amount ₱250.00 → ₱300.00', 'Note (empty) → hi'])
  assert.deepEqual(details({ entity: 'wallet', changes: { archived: [false, true] } }), ['Archived no → yes'])
  assert.deepEqual(details({ entity: 'budget', changes: { warn_at: [80, 90] } }), ['Warn at 80% → 90%'])
  assert.deepEqual(details({ changes: { some_new_column: [1, 2] } }), ['some_new_column changed'])
})

test('auditLine: the words the app uses, not stored values', () => {
  assert.deepEqual(details({ entity: 'wallet', changes: { type: ['cash', 'e_wallet'] } }), ['Type Cash → E-wallet'])
  assert.deepEqual(details({ changes: { kind: ['expense', 'income'] } }), ['Type Expense → Income'])
  assert.deepEqual(details({ changes: { source: ['manual', 'receipt'] } }), ['Source Typed in → Scanned receipt'])
  assert.deepEqual(details({ changes: { date: ['2026-11-04', '2026-11-05'] } }), ['Date Nov 4, 2026 → Nov 5, 2026'])
  assert.deepEqual(details({ entity: 'category', changes: { icon: ['food', 'groceries'] } }), ['Icon changed'])
})

test('auditLine: names a wallet or category, and an older entry that only kept its id says it changed', () => {
  assert.deepEqual(details({ changes: { wallet_id: ['GCash', 'Maya'] } }), ['Wallet GCash → Maya'])
  const [a, b] = ['0f0e0d0c-0b0a-4908-8706-050403020100', '0f0e0d0c-0b0a-4908-8706-050403020101']
  assert.deepEqual(details({ changes: { category_id: [a, b] } }), ['Category changed'])
})

test('auditLine: a receipt photo added, removed or replaced', () => {
  assert.deepEqual(details({ changes: { receipt_path: [null, 'u/t.webp'] } }), ['Receipt photo added'])
  assert.deepEqual(details({ changes: { receipt_path: ['u/t.webp', null] } }), ['Receipt photo removed'])
  assert.deepEqual(details({ changes: { receipt_path: ['u/t.webp', 'u/t.jpg'] } }), ['Receipt photo changed'])
})

test('auditLine: what was added or deleted', () => {
  const held = { amount: 250, kind: 'expense', date: '2026-10-15', wallet_id: 'GCash', receipt_path: 'u/t.webp' }
  const want = ['Type Expense', 'Amount ₱250.00', 'Date Oct 15, 2026', 'Wallet GCash']
  const changes = (pair: (v: unknown) => [unknown, unknown]) => Object.fromEntries(Object.entries(held).map(([k, v]) => [k, pair(v)]))
  assert.deepEqual(details({ action: 'create', changes: changes((v) => [null, v]) }), [...want, 'Receipt photo added'])
  assert.deepEqual(details({ action: 'delete', changes: changes((v) => [v, null]) }), [...want, 'Receipt photo removed'])
})

test('auditLine: long text stays whole', () => {
  assert.deepEqual(details({ changes: { note: ['', 'x'.repeat(50)] } }), [`Note (empty) → ${'x'.repeat(50)}`])
})

test('auditTime and auditDay: Manila, whatever the device says', () => {
  assert.match(auditTime('2026-11-04T00:30:00Z'), /^8:30\sAM$/)
  assert.equal(auditDay('2026-11-03T16:30:00Z'), '2026-11-04')
})
