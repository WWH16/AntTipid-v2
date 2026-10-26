import { toast } from 'sonner'
import { api } from '@/api/endpoints'
import { dropCachedTransaction, invalidate, useQuery } from '@/api/use-query'
import type { Transaction, TransactionKind } from '@/types'

/** Total amount of one kind (expense, income, transfer) in a list. */
export const sumOf = (list: Transaction[] | undefined, kind: TransactionKind) =>
  (list ?? []).filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0)

export const KIND_LABEL: Record<TransactionKind, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer' }

/**
 * Delete with Undo instead of a confirm step; shared by the swipe action and the details panel. The row leaves every
 * list at once, and the server delete runs only when the toast goes without Undo, so Undo just reloads: nothing to
 * re-create, and a receipt photo stays. Totals from the server (budgets, reports) catch up once the delete lands.
 * ponytail: a delete pending when the app is closed never runs, so the transaction stays; fine for a 6s window.
 */
export function deleteWithUndo(t: Transaction) {
  const restore = dropCachedTransaction(t.id)
  let settled = false
  const commit = async () => {
    if (settled) return
    settled = true
    try {
      await api.transactions.remove(t.id)
    } catch {
      restore()
      toast.error(`Couldn't delete ${t.title}. Try again.`)
    }
    invalidate()
  }
  toast.success('Transaction deleted', {
    description: t.title,
    duration: 6000,
    // Sonner runs onClick before onDismiss, so Undo settles first and the dismiss that follows does nothing.
    action: { label: 'Undo', onClick: () => { settled = true; restore(); invalidate() } },
    onAutoClose: commit,
    onDismiss: commit,
  })
}

export const SWIPE_HINT = 'anttipid-swipe-hint'
/** Whether to show the swipe hint: only on touch screens (the only place swipe works), only once, and not with reduced motion. */
export function shouldHintSwipe() {
  try {
    return !localStorage.getItem(SWIPE_HINT) && matchMedia('(pointer: coarse)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

/** A month's unusual purchases (DSS feature 9); one request per month, shared by every row and screen that shows them. */
export const useAnomalies = (month: string) => useQuery(`anomalies:${month}`, () => api.anomalies.list(month))
