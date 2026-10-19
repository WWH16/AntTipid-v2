import type { ReactNode } from 'react'
import { Balance } from '@/components/balance'
import { Badge } from '@/components/ui/badge'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { walletTypeLabel } from '@/lib/wallets'
import type { Wallet } from '@/types'

/** One wallet: name, type and balance. children go after the balance (e.g. a row menu). */
export function WalletItem({ w, children }: { w: Wallet; children?: ReactNode }) {
  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>{w.name} {w.archived && <Badge variant="outline">Archived</Badge>}</ItemTitle>
        <ItemDescription>{walletTypeLabel(w.type)}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Balance value={w.balance} />
        {children}
      </ItemActions>
    </Item>
  )
}
