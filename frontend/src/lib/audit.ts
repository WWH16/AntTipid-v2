import { manilaDate, money } from './format.ts'
import { walletTypeLabel } from './wallets.ts'
import type { AuditEntry, WalletType } from '@/types'

const WORDS: Record<string, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer', manual: 'Typed in', receipt: 'Scanned receipt' }
const word = (v: unknown) => WORDS[String(v)] ?? String(v)
const pesos = (v: unknown) => money(Number(v))
const yesNo = (v: unknown) => (v ? 'yes' : 'no')
const fullDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'UTC' })

// Column name (as the backend logs it) -> label and how to show its values, in the order a row lists them. No way to
// show it means a row only says it changed: there's nothing a reader could use in an icon's name or a photo's path.
const FIELDS: Record<string, [string, ((v: unknown) => string)?]> = {
  kind: ['Type', word], type: ['Type', (v) => walletTypeLabel(v as WalletType)],
  amount: ['Amount', pesos], opening_balance: ['Opening balance', pesos], limit_amount: ['Limit', pesos], warn_at: ['Warn at', (v) => `${v}%`],
  date: ['Date', (v) => fullDate.format(new Date(`${v}T00:00:00Z`))],
  wallet_id: ['Wallet', String], to_wallet_id: ['To wallet', String], category_id: ['Category', String],
  name: ['Name', String], title: ['Description', String], note: ['Note', String],
  archived: ['Archived', yesNo], once_a_month: ['Paid once a month', yesNo],
  source: ['Source', word], icon: ['Icon'], receipt_path: ['Receipt photo'],
}
const place = (key: string) => { const i = Object.keys(FIELDS).indexOf(key); return i < 0 ? Infinity : i }

const VERB = { create: 'Added', update: 'Updated', delete: 'Deleted' } as const
// Entries from before the log named wallets and categories kept only their ids.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i

function change(key: string, [from, to]: [unknown, unknown], action: AuditEntry['action']) {
  const [label, format] = FIELDS[key] ?? [key]
  if (!format || ID.test(String(from)) || ID.test(String(to))) return `${label} ${from === null ? 'added' : to === null ? 'removed' : 'changed'}`
  const show = (v: unknown) => (v === null || v === '' ? '(empty)' : format(v))
  return action === 'update' ? `${label} ${show(from)} → ${show(to)}` : `${label} ${show(action === 'create' ? to : from)}`
}

/** One log row as words: what happened, then one line for each thing it changed, or held when added or deleted. */
export function auditLine(e: Pick<AuditEntry, 'action' | 'entity' | 'label' | 'changes'>): { title: string; details: string[] } {
  if (e.action === 'sign_in') return { title: 'Signed in', details: [] }
  if (e.action === 'restore') return { title: 'Restored a backup', details: e.label ? [e.label] : [] }
  return {
    title: `${VERB[e.action]} ${e.entity}${e.label ? `: ${e.label}` : ''}`,
    details: Object.entries(e.changes ?? {}).sort(([a], [b]) => place(a) - place(b)).map(([k, v]) => change(k, v, e.action)),
  }
}

/** The Manila date an entry belongs to, as YYYY-MM-DD, to group the log by day. */
export const auditDay = (iso: string) => manilaDate.format(new Date(iso))

const time = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', timeStyle: 'short' })
export const auditTime = (iso: string) => time.format(new Date(iso))
