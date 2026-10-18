import type { TransactionKind } from '@/types'

export const KIND_LABEL: Record<TransactionKind, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer' }
