// Run with: npx tsx scripts/check-receipt.ts
import assert from 'node:assert'
import { encodeCanvas, suggestWalletId } from '../src/lib/receipt'
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

// WebP at 0.75 when supported; JPEG at 0.8 when the browser silently returns PNG for WebP (Safari).
assert.strictEqual(
  encodeCanvas({ toDataURL: (t, q) => `data:${t};q=${q}` }),
  'data:image/webp;q=0.75',
)
assert.strictEqual(
  encodeCanvas({ toDataURL: (t, q) => (t === 'image/webp' ? 'data:image/png;base64,AAA' : `data:${t};q=${q}`) }),
  'data:image/jpeg;q=0.8',
)

console.log('Receipt helper self-checks passed')
