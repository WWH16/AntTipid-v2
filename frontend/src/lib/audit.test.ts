import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditLine, auditTime } from './audit.ts'

const entry = (e: object) => ({ action: 'update', entity: 'transaction', label: 'Lunch', changes: null, ...e }) as never

test('auditLine: titles', () => {
  assert.deepEqual(auditLine(entry({ action: 'create', entity: 'budget', label: 'Monthly budget' })), { title: 'Added budget: Monthly budget' })
  assert.deepEqual(auditLine(entry({ action: 'delete', entity: 'wallet', label: 'GCash' })), { title: 'Deleted wallet: GCash' })
  assert.deepEqual(auditLine(entry({ action: 'create', label: '' })), { title: 'Added transaction' })
  assert.deepEqual(auditLine(entry({ action: 'sign_in', entity: 'account', label: '' })), { title: 'Signed in' })
  assert.deepEqual(auditLine(entry({ action: 'restore', entity: 'account', label: '245 transactions' })), { title: 'Restored a backup', detail: '245 transactions' })
})

test('auditLine: what changed', () => {
  assert.equal(auditLine(entry({ changes: { amount: [250, 300], wallet_id: ['a', 'b'] } })).detail, 'Amount ₱250.00 → ₱300.00 · Wallet changed')
  assert.equal(auditLine(entry({ changes: { note: ['', 'hi'] } })).detail, 'Note (empty) → hi')
  assert.equal(auditLine(entry({ entity: 'wallet', changes: { archived: [false, true] } })).detail, 'Archived no → yes')
  assert.equal(auditLine(entry({ entity: 'budget', changes: { warn_at: [80, 90] } })).detail, 'Warn at 80% → 90%')
  assert.equal(auditLine(entry({ changes: { receipt_path: [null, 'u/t.webp'] } })).detail, 'Receipt photo changed')
  assert.equal(auditLine(entry({ changes: { some_new_column: [1, 2] } })).detail, 'some_new_column changed')
})

test('auditLine: long text is cut at 40 characters', () => {
  assert.equal(auditLine(entry({ changes: { note: ['', 'x'.repeat(50)] } })).detail, `Note (empty) → ${'x'.repeat(40)}…`)
})

test('auditTime: Manila time, whatever the device says', () => {
  assert.match(auditTime('2026-11-04T00:30:00Z'), /Nov 4, 2026.*8:30/)
})
