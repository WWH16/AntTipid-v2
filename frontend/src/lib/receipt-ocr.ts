// Client-side receipt OCR parsing using Tesseract.js.
// ponytail: default tesseract CDN loading for the worker and language data is OK for prototype/mock mode.
// Self-host the worker and eng.traineddata files before production to avoid external CDN dependencies.

import { todayIso } from '@/lib/format'
import type { ReceiptItem, ReceiptScan, Wallet, WalletType } from '@/types'

let workerPromise: Promise<import('tesseract.js').Worker> | null = null
const getWorker = () => (workerPromise ??= import('tesseract.js').then((t) => t.createWorker('eng')))

export async function scanReceiptLocal(file: File): Promise<ReceiptScan> {
  const { data } = await (await getWorker()).recognize(file)
  return parseReceiptText(data.text)
}

const pad = (n: string) => n.padStart(2, '0')

function parseDate(text: string): string {
  const ymd = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/)
  if (ymd) return `${ymd[1]}-${pad(ymd[2])}-${pad(ymd[3])}`
  const mdy = text.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2}|\d{2})\b/)
  if (mdy) return `${mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3]}-${pad(mdy[1])}-${pad(mdy[2])}`
  return todayIso()
}

function cleanLine(line: string): string {
  return line.replace(/[|│]/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractAmounts(line: string): number[] {
  // Strip full dates and times so numbers inside them are not confused with prices
  const noDates = line.replace(/\b\d{1,4}[-/. ]\d{1,2}[-/. ]\d{1,4}\b/g, '')
  const noTimes = noDates.replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\b/g, '')
  const cleaned = noTimes.replace(/\b(?:tin|or#?|tel|phone|inv(?:oice)?#?)\s*[:#]?\s*[\d-]+/gi, '')

  const matches = cleaned.matchAll(/(?:[₱₱]\s*|\bPHP\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\b/gi)
  return [...matches].map((m) => parseFloat(m[1].replace(/,/g, ''))).filter((v) => v > 0)
}

const CATEGORY_MAP: [string[], string][] = [
  [
    ['puregold', 'supermarket', 'hypermarket', 'grocery', 'groceries', 'robinsons', 'savemore', 'landmark', 'dali', 'alfamart', 'allmarket', 'marketplace', 'o save', 'waltermart', 'market'],
    'groceries',
  ],
  [
    ['jollibee', 'mcdo', 'mcdonald', 'kfc', 'inasal', 'mang inasal', 'chowking', 'greenwich', 'bonchon', 'shakey', 'pizza', 'burger', 'starbucks', 'cafe', 'coffee', 'resto', 'restaurant', 'diner', 'bistro', 'bakery', 'bakeshop', 'dunkin', 'tim hortons', 'peri', 'samgyup', 'ramen', 'food', 'canteen', 'eatery', 'kitchen', '7-eleven', '7 eleven', 'seven eleven'],
    'food',
  ],
  [
    ['mercury drug', 'watsons', 'southstar', 'generics pharmacy', 'rose pharmacy', 'pharmacy', 'pharma', 'drug', 'clinic', 'hospital', 'dental', 'optical', 'med', 'medical'],
    'health',
  ],
  [
    ['grab', 'angkas', 'joyride', 'moveit', 'shell', 'petron', 'caltex', 'seaoil', 'fuel', 'gas', 'gasoline', 'lto', 'taxi', 'toll', 'mrt', 'lrt', 'jeepney', 'transit'],
    'transport',
  ],
  [
    ['uniqlo', 'lazada', 'shopee', 'zalora', 'h&m', 'zara', 'department store', 'dept store', 'hardware', 'ace hardware', 'wilcon', 'miniso', 'diy', 'clothing', 'apparel', 'fashion'],
    'shopping',
  ],
  [
    ['meralco', 'maynilad', 'manila water', 'water', 'electric', 'utility', 'utilities'],
    'bills',
  ],
  [
    ['pldt', 'globe', 'smart', 'converge', 'dito', 'telecom', 'load', 'internet', 'broadband'],
    'load',
  ],
  [
    ['cinema', 'timezone', 'netflix', 'spotify', 'ktv', 'bar', 'arcade', 'theatre', 'theater', 'movie'],
    'fun',
  ],
]

function suggestCategory(merchant: string): string | undefined {
  const lower = merchant.toLowerCase()
  return CATEGORY_MAP.find(([keywords]) => keywords.some((k) => lower.includes(k)))?.[1]
}

// First match wins. E-wallets and cards come before cash so "CHANGE 0.00" doesn't falsely trigger cash.
const PAYMENTS: [RegExp, WalletType, string][] = [
  [/\bg-?cash\b/i, 'e_wallet', 'GCash'],
  [/\b(?:pay)?maya\b/i, 'e_wallet', 'Maya'],
  [/\bshopeepay\b/i, 'e_wallet', 'ShopeePay'],
  [/\bgrabpay\b/i, 'e_wallet', 'GrabPay'],
  [/\bqr\s*ph\b/i, 'e_wallet', 'QR Ph'],
  [/\bvisa\b/i, 'credit_card', 'VISA'],
  [/\bmaster\s*card\b/i, 'credit_card', 'Mastercard'],
  [/\bjcb\b/i, 'credit_card', 'JCB'],
  [/\bamex\b/i, 'credit_card', 'AMEX'],
  [/\bcredit\b/i, 'credit_card', 'Credit Card'],
  [/\bdebit\b/i, 'bank', 'Debit'],
  [/\bbancnet\b/i, 'bank', 'BancNet'],
  [/\b(?:cash|tendered|change)\b/i, 'cash', 'Cash'],
]

// Lines that are never items. Payment lines are skipped separately via PAYMENTS.
const SKIP_ITEM_WORDS = /\b(?:total|sub\s*total|amount\s*due|vat|tax|payment|invoice|tin|or#|receipt|date|time|clerk|cashier|table|balance)\b/i
const NOT_AMOUNT_LINE = /\b(?:year|date|tel|phone|tin|time|inv(?:oice)?)\b/i

export function parseReceiptText(text: string): ReceiptScan {
  const rawLines = text.split(/\r?\n/).map(cleanLine).filter(Boolean)

  // 1. Merchant: first non-empty line that is mostly letters, skipping generic title banners
  let merchant = ''
  for (const line of rawLines) {
    const letters = (line.match(/[A-Za-z]/g) ?? []).length
    const nonSpace = line.replace(/\s+/g, '').length
    if (nonSpace >= 2 && letters / nonSpace > 0.5) {
      if (/^(?:official\s*receipt|sales\s*invoice|cash\s*invoice|tax\s*invoice|customer\s*copy|welcome\s*to)$/i.test(line)) {
        continue
      }
      merchant = line
      break
    }
  }
  if (!merchant) merchant = rawLines[0]

  // 2. Total: last amount on the last TOTAL line, else the largest amount on the receipt
  let total: number | null = null
  for (const line of rawLines) {
    const isTotalKeyword = /\b(?:grand\s*total|amount\s*due|total\s*due|total)\b/i.test(line)
    const isSkip = /\b(?:sub\s*total|subtotal|vat|tax|change)\b/i.test(line)
    if (isTotalKeyword && !isSkip) {
      const amounts = extractAmounts(line)
      if (amounts.length > 0) {
        total = amounts[amounts.length - 1]
      }
    }
  }
  total ??= Math.max(0, ...rawLines.filter((l) => !NOT_AMOUNT_LINE.test(l)).flatMap(extractAmounts))
  if (!total) {
    throw new Error("Could not detect total amount on receipt")
  }

  // 3. Items: lines ending in an amount that are not total, tax, change, cash, VAT or payment lines
  const items: ReceiptItem[] = []
  for (const line of rawLines) {
    if (SKIP_ITEM_WORDS.test(line) || PAYMENTS.some(([re]) => re.test(line))) continue

    // Must end with an amount
    const trailingMatch = line.match(/(?:[₱₱]\s*|\bPHP\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+\.\d{1,2})\s*$/i)
    if (!trailingMatch || trailingMatch.index === undefined) continue

    const lineAmount = parseFloat(trailingMatch[1].replace(/,/g, ''))
    if (!(lineAmount > 0)) continue

    let desc = line.slice(0, trailingMatch.index).trim()
    if (!desc || (desc.match(/[A-Za-z]/g) ?? []).length < 2) continue

    // Clean any inline @ unit price e.g. "@ 16.50"
    desc = desc.replace(/@\s*\d+(?:\.\d{1,2})?\s*$/, '').trim()

    // Leading "N x", "N @", "Nx", "N pcs"
    const leadingQty = desc.match(/^(\d+)\s*(?:[xX@]|pcs?|pc)?\s+(.+)$/)
    const qty = leadingQty ? parseInt(leadingQty[1], 10) || 1 : 1
    const name = leadingQty ? leadingQty[2].trim() : desc

    items.push({ name, qty, price: Math.round((lineAmount / qty) * 100) / 100 })
  }

  const [, paymentMethod, paymentLabel] = PAYMENTS.find(([re]) => re.test(text)) ?? []
  return { merchant, date: parseDate(text), total, items, suggestedCategoryId: suggestCategory(merchant), paymentMethod, paymentLabel }
}

export function suggestWalletId(scan: ReceiptScan, wallets: Wallet[]): string | undefined {
  const active = wallets.filter((w) => !w.archived)
  const label = scan.paymentLabel?.toLowerCase()
  return (label ? active.find((w) => w.name.toLowerCase().includes(label)) : undefined)?.id
    ?? active.find((w) => w.type === scan.paymentMethod)?.id
}
