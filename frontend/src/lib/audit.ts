import { money } from './format.ts'
import type { AuditEntry } from '@/types'

type Show = 'money' | 'yesno' | 'percent' | 'text' | 'changed'
// Column name (as the backend logs it) -> label and how to show its values.
const FIELDS: Record<string, [string, Show]> = {
  amount: ['Amount', 'money'], opening_balance: ['Opening balance', 'money'], limit_amount: ['Limit', 'money'],
  title: ['Description', 'text'], name: ['Name', 'text'], note: ['Note', 'text'], date: ['Date', 'text'],
  kind: ['Type', 'text'], type: ['Type', 'text'], icon: ['Icon', 'text'], source: ['Source', 'text'],
  archived: ['Archived', 'yesno'], once_a_month: ['Paid once a month', 'yesno'], warn_at: ['Warn at', 'percent'],
  wallet_id: ['Wallet', 'changed'], to_wallet_id: ['To wallet', 'changed'], category_id: ['Category', 'changed'], receipt_path: ['Receipt photo', 'changed'],
}

const VERB = { create: 'Added', update: 'Updated', delete: 'Deleted' } as const

function show(v: unknown, how: Show) {
  if (v === null || v === '') return '(empty)'
  if (how === 'money') return money(Number(v))
  if (how === 'yesno') return v ? 'yes' : 'no'
  if (how === 'percent') return `${v}%`
  const s = String(v)
  return s.length > 40 ? `${s.slice(0, 40)}…` : s
}

function change(key: string, [from, to]: [unknown, unknown]) {
  const [label, how] = FIELDS[key] ?? [key, 'changed']
  return how === 'changed' ? `${label} changed` : `${label} ${show(from, how)} → ${show(to, how)}`
}

/** One log row as words: what happened, and for an edit, what changed. */
export function auditLine(e: Pick<AuditEntry, 'action' | 'entity' | 'label' | 'changes'>): { title: string; detail?: string } {
  if (e.action === 'sign_in') return { title: 'Signed in' }
  if (e.action === 'restore') return { title: 'Restored a backup', detail: e.label || undefined }
  const title = `${VERB[e.action]} ${e.entity}${e.label ? `: ${e.label}` : ''}`
  const parts = Object.entries(e.changes ?? {}).map(([k, v]) => change(k, v))
  return parts.length ? { title, detail: parts.join(' · ') } : { title }
}

const time = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
export const auditTime = (iso: string) => time.format(new Date(iso))
