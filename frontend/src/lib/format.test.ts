import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanMoneyInput, fieldError, formatMoneyInput } from './format.ts'
import { cleanReceiptItems, itemProblem, itemsTotal, lineTotal, toDraftItems } from './receipt.ts'

test('cleanMoneyInput strips commas, currency symbols, and extra decimal points', () => {
  assert.equal(cleanMoneyInput('₱15,000.50'), '15000.50')
  assert.equal(cleanMoneyInput('1,234.56.78'), '1234.5678')
  assert.equal(cleanMoneyInput('-8,420.25', false), '8420.25')
  assert.equal(cleanMoneyInput('-8,420.25', true), '-8420.25')
  assert.equal(cleanMoneyInput('  -  ', true), '-')
  assert.equal(cleanMoneyInput('...5'), '.5')
  assert.equal(cleanMoneyInput('5..'), '5.')
  assert.equal(cleanMoneyInput(''), '')
})

test('cleanMoneyInput caps whole pesos at 10 digits and keeps the decimals', () => {
  assert.equal(cleanMoneyInput('99999999999999'), '9999999999')
  assert.equal(cleanMoneyInput('12,345,678,901.25'), '1234567890.25')
  assert.equal(cleanMoneyInput('-12345678901', true), '-1234567890')
})

test('formatMoneyInput adds thousand commas while preserving in-progress decimals and negative signs', () => {
  assert.equal(formatMoneyInput(''), '')
  assert.equal(formatMoneyInput('-', true), '-')
  assert.equal(formatMoneyInput('500'), '500')
  assert.equal(formatMoneyInput('5000'), '5,000')
  assert.equal(formatMoneyInput('1234567'), '1,234,567')
  assert.equal(formatMoneyInput('1234.'), '1,234.')
  assert.equal(formatMoneyInput('1234.5'), '1,234.5')
  assert.equal(formatMoneyInput('1234.50'), '1,234.50')
  assert.equal(formatMoneyInput('.50'), '.50')
  assert.equal(formatMoneyInput('-8420.5', true), '-8,420.5')
  assert.equal(formatMoneyInput('1000.1234'), '1,000.1234')
})

test('receipt draft item helpers compute subtotals and filter incomplete rows', () => {
  const drafts = toDraftItems([
    { name: 'Chickenjoy', qty: 2, price: 89.5 },
    { name: 'Peach Mango Pie', qty: 1, price: 45 },
  ])
  assert.deepEqual(drafts, [
    { name: 'Chickenjoy', qty: '2', price: '89.5' },
    { name: 'Peach Mango Pie', qty: '1', price: '45' },
  ])
  assert.equal(itemsTotal([...drafts, { name: 'Half typed', qty: '', price: '100' }]), 224)

  const cleaned = cleanReceiptItems([
    { name: '  Chickenjoy  ', qty: '2', price: '89.5' },
    { name: 'Burger', qty: '1', price: '' },
    { name: '   ', qty: '1', price: '50' },
    { name: 'Zero qty', qty: '0', price: '50' },
  ])
  assert.deepEqual(cleaned, [{ name: 'Chickenjoy', qty: 2, price: 89.5 }])
  assert.equal(cleanReceiptItems([], false), undefined)
  assert.deepEqual(cleanReceiptItems([], true), [])
})

test('totals use saved centavo prices, and started rows say what they need', () => {
  const rows = [
    { name: 'Butter Cream', qty: '2', price: '75.975' },
    { name: 'Chicken', qty: '1', price: '250' },
  ]
  // 2 × 75.97 (as saved) + 250, not 2 × 75.975 + 250 = 401.95
  assert.equal(itemsTotal(rows), 401.94)
  assert.deepEqual(cleanReceiptItems(rows), [
    { name: 'Butter Cream', qty: 2, price: 75.97 },
    { name: 'Chicken', qty: 1, price: 250 },
  ])
  assert.equal(lineTotal({ name: 'Pie', qty: '3', price: '45' }), 135)

  assert.equal(itemProblem({ name: '', qty: '1', price: '' }), null)
  assert.equal(itemProblem({ name: 'Rice', qty: '1', price: '' }), 'a price')
  assert.equal(itemProblem({ name: 'Rice', qty: '', price: '50' }), 'a quantity above 0')
  assert.equal(itemProblem({ name: '', qty: '1', price: '50' }), 'a name')
  assert.equal(itemProblem({ name: 'Free bag', qty: '1', price: '0' }), null)
})

test('fieldError names the field to fix instead of the raw 422 list', () => {
  assert.equal(fieldError([{ loc: ['body', 'items', 1, 'qty'], msg: 'Input should be greater than 0' }]),
    "Item 2 on the receipt list isn't valid. Check its name, quantity and price.")
  assert.equal(fieldError([{ loc: ['body', 'title'], msg: 'String should have at most 200 characters' }]),
    "The description isn't valid. Check it and try again.")
  assert.equal(fieldError([{ loc: ['body', 'walletId'], msg: 'Input should be a valid UUID' }]),
    "Some details aren't valid. Check the form and try again.")
  assert.equal(fieldError('Pick a category.'), null)
})
