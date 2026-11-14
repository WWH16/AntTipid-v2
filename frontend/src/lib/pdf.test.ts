import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPdf, pdfText, transactionTable } from './pdf.ts'

test('transactionTable: one row per transaction, transfers name both wallets, the year only when asked', () => {
  const names: Record<string, string> = { food: 'Food', cash: 'Cash', gcash: 'GCash' }
  const of = (id?: string) => (id ? names[id] : undefined)
  const txs = [
    { id: '1', kind: 'expense' as const, amount: 250, title: 'Jollibee', date: '2026-11-04', walletId: 'cash', categoryId: 'food', note: '', source: 'manual' as const },
    { id: '2', kind: 'transfer' as const, amount: 500, title: 'Top up', date: '2026-11-05', walletId: 'cash', toWalletId: 'gcash', note: '', source: 'manual' as const },
  ]
  const table = transactionTable(txs, of, of)
  assert.deepEqual(table.rows, [['Nov 4', 'Jollibee', 'Food', 'Cash', '−₱250.00'], ['Nov 5', 'Top up', '—', 'Cash to GCash', '₱500.00']])
  assert.equal(transactionTable(txs, of, of, true).rows[0][0], 'Nov 4, 2026')
})

test('pdfText: peso, minus and curly quotes in plain text the built-in PDF font can draw', () => {
  assert.equal(pdfText('−₱1,250.00'), '-PHP 1,250.00')
  assert.equal(pdfText('“Jollibee’s” – piña…'), '"Jollibee\'s" - piña...')
  assert.equal(pdfText('Lunch🍔'), 'Lunch') // no glyph for it, so it's left out instead of drawn as junk
})

test('buildPdf: a titled document with each section and table row', async () => {
  const doc = await buildPdf('Transactions', ['November 2026', 'Prepared for Andrea'], [
    { heading: 'Spending', head: ['Category', 'Spent'], rows: [['Food', '₱250.00']], right: [1] },
    { heading: 'Notes', text: 'No transfers this month.' },
  ])
  const out = doc.output()
  assert.ok(out.startsWith('%PDF-'))
  for (const text of ['Transactions', 'November 2026', 'Spending', 'Food', 'PHP 250.00', 'No transfers this month.']) {
    assert.ok(out.includes(`(${text})`), text)
  }
})
