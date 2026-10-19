// Run with: npx tsx scripts/check-ocr.ts
import assert from 'node:assert'
import { parseReceiptText, suggestWalletId } from '../src/lib/receipt-ocr'
import { todayIso } from '../src/lib/format'
import type { Wallet } from '../src/types'

const wallets: Wallet[] = [
  { id: 'cash', name: 'Cash', type: 'cash', balance: 2350, archived: false },
  { id: 'gcash', name: 'GCash', type: 'e_wallet', balance: 4870, archived: false },
  { id: 'bpi', name: 'BPI Savings', type: 'savings', balance: 48200, archived: false },
  { id: 'maya', name: 'Maya', type: 'e_wallet', balance: 960, archived: false },
  { id: 'card', name: 'BDO Credit Card', type: 'credit_card', balance: -8420, archived: false },
]

const cases = [
  {
    name: 'GCash grocery receipt',
    text: `
PUREGOLD PRICE CLUB, INC.
E. Rodriguez Sr. Ave., QC
TIN: 004-325-876-000
DATE: 10/18/2026 14:32:00
1 JASMINE RICE 5KG 345.00
1 EGGS TRAY OF 30 268.00
6 X PANCIT CANTON 99.00
SUBTOTAL 712.00
VAT 12% 85.44
TOTAL AMOUNT 1,186.50
GCASH REFERENCE: 987654321
CHANGE 0.00
THANK YOU FOR SHOPPING!
`,
    expect: { merchant: 'PUREGOLD PRICE CLUB, INC.', date: '2026-10-18', total: 1186.5, items: 3, suggestedCategoryId: 'groceries', paymentMethod: 'e_wallet', paymentLabel: 'GCash', wallet: 'gcash' },
  },
  {
    name: 'VISA receipt that also prints CHANGE 0.00',
    text: `
SM SUPERMARKET
SM North EDSA, Quezon City
DATE: 2026-10-15 19:21
2 X GROUND BEEF 500G 420.00
1 FRESH MILK 1L 110.00
SUBTOTAL 530.00
GRAND TOTAL 2,140.00
PAYMENT METHOD: VISA ****1234
AMOUNT TENDERED: 2,140.00
CHANGE 0.00
APPROVED
`,
    // wallet matches BDO Credit Card by type
    expect: { merchant: 'SM SUPERMARKET', date: '2026-10-15', total: 2140, items: 2, suggestedCategoryId: 'groceries', paymentMethod: 'credit_card', paymentLabel: 'VISA', wallet: 'card' },
  },
  {
    name: 'Cash receipt with CASH TENDERED and CHANGE',
    text: `
JOLLIBEE
Cubao Farmers Plaza
DATE: 10-14-26
1 YUMBURGER W/ CHEESE 79.00
1 CHICKENJOY W/ RICE 120.00
1 PEACH MANGO PIE 50.00
TOTAL 289.00
CASH TENDERED 500.00
CHANGE 211.00
THANK YOU PLEASE COME AGAIN
`,
    expect: { merchant: 'JOLLIBEE', date: '2026-10-14', total: 289, items: 3, suggestedCategoryId: 'food', paymentMethod: 'cash', paymentLabel: 'Cash', wallet: 'cash' },
  },
  {
    name: 'Receipt with no payment info',
    text: `
7-ELEVEN
Store #1042 Boni Ave
DATE: 10/12/2026
1 C2 GREEN TEA 500ML 35.00
2 GULAMAN 40.00
1 SISIG WITH RICE 70.00
AMOUNT DUE 145.00
THANK YOU VISIT AGAIN
`,
    expect: { merchant: '7-ELEVEN', date: '2026-10-12', total: 145, items: 3, suggestedCategoryId: 'food', paymentMethod: undefined, paymentLabel: undefined, wallet: undefined },
  },
  {
    name: 'OCR noise: TIN header, O-for-0, lost decimal, VAT flag, T0TAL, TOTAL ITEMS, day-first date',
    text: `
VAT REG TIN 004-325-876-000
MERCURY DRUG
DATE: 18/10/2026
1 BIOGESIC 500MG 45.OO V
2 X VITAMIN C 120 00
T0TAL 165.00
TOTAL ITEMS 3
CASH 200.00
CHANGE 35.00
`,
    expect: { merchant: 'MERCURY DRUG', date: '2026-10-18', total: 165, items: 2, suggestedCategoryId: 'health', paymentMethod: 'cash', paymentLabel: 'Cash', wallet: 'cash' },
  },
  {
    name: 'Unreadable TOTAL falls back to largest price, ignoring GCash reference number',
    text: `
PUREGOLD
1 RICE 345.00
1 EGGS 268.00
TQTAL 613.00
GCASH REF 987654321
`,
    // the garbled TQTAL line is counted as an item; the user fixes it on the review screen
    expect: { merchant: 'PUREGOLD', date: todayIso(), total: 613, items: 3, suggestedCategoryId: 'groceries', paymentMethod: 'e_wallet', paymentLabel: 'GCash', wallet: 'gcash' },
  },
]

for (const c of cases) {
  const s = parseReceiptText(c.text)
  const { merchant, date, total, suggestedCategoryId, paymentMethod, paymentLabel } = s
  assert.deepStrictEqual(
    { merchant, date, total, items: s.items.length, suggestedCategoryId, paymentMethod, paymentLabel, wallet: suggestWalletId(s, wallets) },
    c.expect,
    c.name,
  )
}

assert.throws(() => parseReceiptText('RANDOM STORE\nJUST SOME NOTES\nNO NUMBERS HERE'), Error)

console.log('OCR self-checks passed')
