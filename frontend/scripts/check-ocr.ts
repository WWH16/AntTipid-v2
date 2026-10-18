import assert from 'node:assert'
import { parseReceiptText, suggestWalletId } from '../src/lib/receipt-ocr'
import type { Wallet } from '../src/types'

const mockWallets: Wallet[] = [
  { id: 'cash', name: 'Cash', type: 'cash', balance: 2350, archived: false },
  { id: 'gcash', name: 'GCash', type: 'e_wallet', balance: 4870, archived: false },
  { id: 'bpi', name: 'BPI Savings', type: 'savings', balance: 48200, archived: false },
  { id: 'maya', name: 'Maya', type: 'e_wallet', balance: 960, archived: false },
  { id: 'card', name: 'BDO Credit Card', type: 'credit_card', balance: -8420, archived: false },
]

// 1. GCash grocery receipt
const gcashReceipt = `
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
`

const scan1 = parseReceiptText(gcashReceipt)
console.log('--- Test 1: GCash Grocery Receipt ---')
console.log(scan1)
assert.strictEqual(scan1.merchant, 'PUREGOLD PRICE CLUB, INC.')
assert.strictEqual(scan1.date, '2026-10-18')
assert.strictEqual(scan1.total, 1186.5)
assert.strictEqual(scan1.items.length, 3)
assert.strictEqual(scan1.suggestedCategoryId, 'groceries')
assert.strictEqual(scan1.paymentMethod, 'e_wallet')
assert.strictEqual(scan1.paymentLabel, 'GCash')
const wallet1 = suggestWalletId(scan1, mockWallets)
assert.strictEqual(wallet1, 'gcash')
console.log('✓ Test 1 passed\n')

// 2. VISA receipt that also prints "CHANGE 0.00"
const visaReceipt = `
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
`

const scan2 = parseReceiptText(visaReceipt)
console.log('--- Test 2: VISA Receipt with CHANGE 0.00 ---')
console.log(scan2)
assert.strictEqual(scan2.merchant, 'SM SUPERMARKET')
assert.strictEqual(scan2.date, '2026-10-15')
assert.strictEqual(scan2.total, 2140.0)
assert.strictEqual(scan2.items.length, 2)
assert.strictEqual(scan2.suggestedCategoryId, 'groceries')
assert.strictEqual(scan2.paymentMethod, 'credit_card')
assert.strictEqual(scan2.paymentLabel, 'VISA')
const wallet2 = suggestWalletId(scan2, mockWallets)
assert.strictEqual(wallet2, 'card') // matches BDO Credit Card by type
console.log('✓ Test 2 passed\n')

// 3. Cash receipt with CASH TENDERED and CHANGE
const cashReceipt = `
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
`

const scan3 = parseReceiptText(cashReceipt)
console.log('--- Test 3: Cash Receipt with CASH TENDERED & CHANGE ---')
console.log(scan3)
assert.strictEqual(scan3.merchant, 'JOLLIBEE')
assert.strictEqual(scan3.date, '2026-10-14')
assert.strictEqual(scan3.total, 289.0)
assert.strictEqual(scan3.items.length, 3)
assert.strictEqual(scan3.suggestedCategoryId, 'food')
assert.strictEqual(scan3.paymentMethod, 'cash')
assert.strictEqual(scan3.paymentLabel, 'Cash')
const wallet3 = suggestWalletId(scan3, mockWallets)
assert.strictEqual(wallet3, 'cash')
console.log('✓ Test 3 passed\n')

// 4. Receipt with no payment info
const noPaymentReceipt = `
7-ELEVEN
Store #1042 Boni Ave
DATE: 10/12/2026
1 C2 GREEN TEA 500ML 35.00
2 GULAMAN 40.00
1 SISIG WITH RICE 70.00
AMOUNT DUE 145.00
THANK YOU VISIT AGAIN
`

const scan4 = parseReceiptText(noPaymentReceipt)
console.log('--- Test 4: Receipt with No Payment Info ---')
console.log(scan4)
assert.strictEqual(scan4.merchant, '7-ELEVEN')
assert.strictEqual(scan4.date, '2026-10-12')
assert.strictEqual(scan4.total, 145.0)
assert.strictEqual(scan4.items.length, 3)
assert.strictEqual(scan4.suggestedCategoryId, 'food')
assert.strictEqual(scan4.paymentMethod, undefined)
assert.strictEqual(scan4.paymentLabel, undefined)
const wallet4 = suggestWalletId(scan4, mockWallets)
assert.strictEqual(wallet4, undefined)
console.log('✓ Test 4 passed\n')

// 5. Error case: Receipt with no total
console.log('--- Test 5: Error on Missing Total ---')
let threw = false
try {
  parseReceiptText(`
RANDOM STORE
JUST SOME NOTES
NO NUMBERS HERE
`)
} catch (e) {
  threw = true
  assert.ok(e instanceof Error)
  console.log('Caught expected error:', (e as Error).message)
}
assert.strictEqual(threw, true)
console.log('✓ Test 5 passed\n')

console.log('ALL OCR SELF-CHECKS PASSED SUCCESSFULLY!')
