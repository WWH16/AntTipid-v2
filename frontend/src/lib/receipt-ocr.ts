// Client-side receipt OCR parsing using Tesseract.js.
// ponytail: default tesseract CDN loading for the worker and language data is OK for prototype/mock mode.
// Self-host the worker and eng.traineddata files before production to avoid external CDN dependencies.

import type { ReceiptItem, ReceiptScan, Wallet, WalletType } from '@/types'

let workerPromise: Promise<import('tesseract.js').Worker> | null = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      return await createWorker('eng')
    })()
  }
  return workerPromise
}

export async function scanReceiptLocal(file: File): Promise<ReceiptScan> {
  const worker = await getWorker()
  const { data } = await worker.recognize(file)
  return parseReceiptText(data.text)
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export function parseDate(text: string): string {
  // 1. YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const ymd = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/)
  if (ymd) {
    const y = ymd[1]
    const m = ymd[2].padStart(2, '0')
    const d = ymd[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // 2. MM/DD/YYYY, MM-DD-YYYY, MM.DD.YYYY
  const mdy = text.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2})\b/)
  if (mdy) {
    const m = mdy[1].padStart(2, '0')
    const d = mdy[2].padStart(2, '0')
    const y = mdy[3]
    return `${y}-${m}-${d}`
  }

  // 3. MM/DD/YY, MM-DD-YY
  const mdy2 = text.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](\d{2})\b/)
  if (mdy2) {
    const m = mdy2[1].padStart(2, '0')
    const d = mdy2[2].padStart(2, '0')
    const yy = parseInt(mdy2[3], 10)
    const y = yy >= 70 ? `19${yy}` : `20${String(yy).padStart(2, '0')}`
    return `${y}-${m}-${d}`
  }

  // 4. Named months e.g. Oct 18, 2026 or 18 Oct 2026
  const named1 = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(0?[1-9]|[12]\d|3[01])[,\s]+(20\d{2}|\d{2})\b/i)
  if (named1) {
    const m = MONTHS[named1[1].slice(0, 3).toLowerCase()]
    const d = named1[2].padStart(2, '0')
    let y = named1[3]
    if (y.length === 2) y = `20${y}`
    return `${y}-${m}-${d}`
  }

  const named2 = text.match(/\b(0?[1-9]|[12]\d|3[01])\s+[-/.]?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s]+(20\d{2}|\d{2})\b/i)
  if (named2) {
    const d = named2[1].padStart(2, '0')
    const m = MONTHS[named2[2].slice(0, 3).toLowerCase()]
    let y = named2[3]
    if (y.length === 2) y = `20${y}`
    return `${y}-${m}-${d}`
  }

  // Default to today
  return new Date().toISOString().slice(0, 10)
}

function cleanLine(line: string): string {
  return line.replace(/[|│]/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractAmounts(line: string): number[] {
  // Strip full dates and times so numbers inside them are not confused with prices
  const noDates = line.replace(/\b\d{1,4}[-/. ]\d{1,2}[-/. ]\d{1,4}\b/g, '')
  const noTimes = noDates.replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\b/g, '')
  const cleaned = noTimes.replace(/\b(?:tin|or#?|tel|phone|inv(?:oice)?#?)\s*[:#]?\s*[\d-]+/gi, '')

  const matches = cleaned.matchAll(/(?:[₱\u20B1]\s*|\bPHP\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\b/gi)
  const results: number[] = []
  for (const m of matches) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) {
      results.push(val)
    }
  }
  return results
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
  for (const [keywords, catId] of CATEGORY_MAP) {
    if (keywords.some((k) => lower.includes(k))) {
      return catId
    }
  }
  return undefined
}

export function detectPaymentMethod(text: string): { method?: WalletType; label?: string } {
  // Check rules in order; first match wins. E-wallets and cards before cash so "CHANGE 0.00" doesn't falsely trigger cash.
  // Rule a: e_wallet
  if (/\b(?:g-?cash)\b/i.test(text)) return { method: 'e_wallet', label: 'GCash' }
  if (/\b(?:paymaya|maya)\b/i.test(text)) return { method: 'e_wallet', label: 'Maya' }
  if (/\bshopeepay\b/i.test(text)) return { method: 'e_wallet', label: 'ShopeePay' }
  if (/\bgrabpay\b/i.test(text)) return { method: 'e_wallet', label: 'GrabPay' }
  if (/\bqr\s*ph\b/i.test(text)) return { method: 'e_wallet', label: 'QR Ph' }

  // Rule b: credit_card
  if (/\bvisa\b/i.test(text)) return { method: 'credit_card', label: 'VISA' }
  if (/\b(?:master\s*card|mastercard)\b/i.test(text)) return { method: 'credit_card', label: 'Mastercard' }
  if (/\bjcb\b/i.test(text)) return { method: 'credit_card', label: 'JCB' }
  if (/\bamex\b/i.test(text)) return { method: 'credit_card', label: 'AMEX' }
  if (/\bcredit(?:\s*card)?\b/i.test(text)) return { method: 'credit_card', label: 'Credit Card' }

  // Rule c: bank
  if (/\b(?:debit(?:\s*card)?)\b/i.test(text)) return { method: 'bank', label: 'Debit' }
  if (/\bbancnet\b/i.test(text)) return { method: 'bank', label: 'BancNet' }

  // Rule d: cash
  if (/\b(?:cash(?:\s*tendered)?|amount\s*tendered)\b/i.test(text) || /\bchange\b/i.test(text)) {
    return { method: 'cash', label: 'Cash' }
  }

  // Rule e: no match
  return {}
}

const SKIP_ITEM_WORDS = /\b(?:total|sub\s*total|subtotal|amount\s*due|vat|tax|change|cash|tendered|payment|visa|mastercard|master\s*card|jcb|amex|credit|debit|bancnet|gcash|maya|paymaya|shopeepay|grabpay|qr\s*ph|invoice|tin|or#|receipt|date|time|clerk|cashier|table|balance)\b/i

export function parseReceiptText(text: string): ReceiptScan {
  const rawLines = text.split(/\r?\n/).map(cleanLine).filter(Boolean)
  if (!rawLines.length) {
    throw new Error("Could not detect any text on receipt")
  }

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

  // 2. Date
  const date = parseDate(text)

  // 3. Total amount
  let total: number | null = null
  for (const line of rawLines) {
    const isTotalKeyword = /\b(?:grand\s*total|amount\s*due|total\s*due|\btotal\b)\b/i.test(line)
    const isSkip = /\b(?:sub\s*total|subtotal|vat|tax|change)\b/i.test(line)
    if (isTotalKeyword && !isSkip) {
      const amounts = extractAmounts(line)
      if (amounts.length > 0) {
        total = amounts[amounts.length - 1]
      }
    }
  }

  // If no explicit total line, use the largest amount found on the receipt
  if (total === null) {
    let max = 0
    for (const line of rawLines) {
      if (/\b(?:year|date|tel|phone|tin|time|inv(?:oice)?)\b/i.test(line)) continue
      const amounts = extractAmounts(line)
      for (const a of amounts) {
        if (a > max) max = a
      }
    }
    if (max > 0) total = max
  }

  if (!total || isNaN(total) || total <= 0) {
    throw new Error("Could not detect total amount on receipt")
  }

  // 4. Items: lines ending in an amount that are not total, tax, change, cash, VAT or payment lines
  const items: ReceiptItem[] = []
  for (const line of rawLines) {
    if (SKIP_ITEM_WORDS.test(line)) continue

    // Must end with an amount
    const trailingMatch = line.match(/(?:[₱\u20B1]\s*|\bPHP\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+\.\d{1,2})\s*$/i)
    if (!trailingMatch || trailingMatch.index === undefined) continue

    const lineAmount = parseFloat(trailingMatch[1].replace(/,/g, ''))
    if (isNaN(lineAmount) || lineAmount <= 0) continue

    let desc = line.slice(0, trailingMatch.index).trim()
    if (!desc || (desc.match(/[A-Za-z]/g) ?? []).length < 2) continue

    // Clean any inline @ unit price e.g. "@ 16.50"
    desc = desc.replace(/@\s*\d+(?:\.\d{1,2})?\s*$/, '').trim()

    let qty = 1
    let name = desc

    // Check for leading "N x", "N @", "Nx", "N pcs"
    const leadingQty = desc.match(/^(\d+)\s*(?:[xX@]|pcs?|pc)?\s+(.+)$/)
    if (leadingQty) {
      qty = parseInt(leadingQty[1], 10) || 1
      name = leadingQty[2].trim()
    } else {
      // Check for trailing "Nx", "N x"
      const trailingQty = desc.match(/^(.+?)\s+(\d+)\s*[xX@]\s*$/)
      if (trailingQty) {
        qty = parseInt(trailingQty[2], 10) || 1
        name = trailingQty[1].trim()
      }
    }

    const price = Math.round((lineAmount / qty) * 100) / 100
    items.push({ name, qty, price })
  }

  // 5. Suggested Category & Payment Method
  const suggestedCategoryId = suggestCategory(merchant)
  const { method: paymentMethod, label: paymentLabel } = detectPaymentMethod(text)

  return {
    merchant,
    date,
    total,
    items,
    suggestedCategoryId,
    paymentMethod,
    paymentLabel,
  }
}

export function suggestWalletId(scan: ReceiptScan, wallets: Wallet[]): string | undefined {
  const activeWallets = wallets.filter((w) => !w.archived)

  // 1. First, match paymentLabel against wallet names
  if (scan.paymentLabel) {
    const labelLower = scan.paymentLabel.toLowerCase().trim()

    // 1a. Exact match
    const exact = activeWallets.find((w) => w.name.toLowerCase().trim() === labelLower)
    if (exact) return exact.id

    // 1b. Wallet name contains paymentLabel (e.g. "BDO Credit Card" contains "credit card")
    const nameContainsLabel = activeWallets.find((w) => w.name.toLowerCase().includes(labelLower))
    if (nameContainsLabel) return nameContainsLabel.id

    // 1c. Payment label contains wallet name as a whole word
    const labelContainsWord = activeWallets.find((w) => {
      const escaped = w.name.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i')
      return regex.test(labelLower)
    })
    if (labelContainsWord) return labelContainsWord.id
  }

  // 2. Else, return the first non-archived wallet whose type === paymentMethod
  if (scan.paymentMethod) {
    const byType = activeWallets.find((w) => w.type === scan.paymentMethod)
    if (byType) return byType.id
  }

  // 3. Else, return undefined
  return undefined
}
