import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Wallet balance; negative (e.g. credit card owed) shows in destructive. */
export function Balance({ value }: { value: number }) {
  return <span className={cn('font-medium tabular-nums', value < 0 && 'text-destructive')}>{money(value)}</span>
}
