// Reads a backup file before it is sent for restoring: checks it is ours and counts what it holds.
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024

export function readBackup(text: string) {
  let data: Record<string, unknown> | null = null
  try { data = JSON.parse(text) } catch { /* not JSON: handled below */ }
  const lists = ['wallets', 'categories', 'transactions', 'budgets'] as const
  if (!data || typeof data !== 'object' || data.app !== 'anttipid' || typeof data.exportedOn !== 'string' || lists.some((k) => !Array.isArray(data[k]))) {
    throw new Error("That file isn't an AntTipid backup.")
  }
  if (data.version !== 1) throw new Error('This backup is from a newer version of AntTipid.')
  const n = (k: (typeof lists)[number]) => (data[k] as unknown[]).length
  return { exportedOn: data.exportedOn, wallets: n('wallets'), categories: n('categories'), transactions: n('transactions'), budgets: n('budgets') }
}
