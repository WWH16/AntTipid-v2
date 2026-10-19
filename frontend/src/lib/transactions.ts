import type { Transaction, TransactionKind } from '@/types'

/** Total amount of one kind (expense, income, transfer) in a list. */
export const sumOf = (list: Transaction[] | undefined, kind: TransactionKind) =>
  (list ?? []).filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0)
