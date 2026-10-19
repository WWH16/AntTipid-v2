// Run with: npx tsx scripts/check-receipt.ts
import assert from 'node:assert'
import { suggestWalletId } from '../src/lib/receipt'
import type { ReceiptScan, Wallet } from '../src/types'

const wallets: Wallet[] = [
  { id: 'cash', name: 'Cash', type: 'cash', balance: 0, archived: false },
  { id: 'old-gcash', name: 'GCash (old)', type: 'e_wallet', balance: 0, archived: true },
  { id: 'gcash', name: 'GCash', type: 'e_wallet', balance: 0, archived: false },
  { id: 'card', name: 'BDO Credit Card', type: 'credit_card', balance: 0, archived: false },
]
const scan = (paymentLabel?: string, paymentMethod?: ReceiptScan['paymentMethod']): ReceiptScan =>
  ({ merchant: 'X', date: '2026-10-19', total: 1, items: [], paymentLabel, paymentMethod })

assert.strictEqual(suggestWalletId(scan('GCASH', 'e_wallet'), wallets), 'gcash') // by name, skipping archived
assert.strictEqual(suggestWalletId(scan('VISA', 'credit_card'), wallets), 'card') // no name match, falls back to type
assert.strictEqual(suggestWalletId(scan(), wallets), undefined)

console.log('Receipt helper self-checks passed')
