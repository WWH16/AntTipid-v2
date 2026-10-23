// Add or edit a wallet. Its own file: Settings, Home's first-run setup and the add-transaction sheet all open it.
import { useState } from 'react'
import { api } from '@/api/endpoints'
import { upsertCached } from '@/api/use-query'
import { BusyButton } from '@/components/busy-button'
import { MoneyInput } from '@/components/money-input'
import { ResponsivePanel } from '@/components/responsive-panel'
import { SimpleSelect } from '@/components/simple-select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAction } from '@/hooks/use-action'
import { done } from '@/lib/done'
import { money } from '@/lib/format'
import { WALLET_TYPES } from '@/lib/wallets'
import type { Wallet, WalletType } from '@/types'

export function WalletForm({ wallet, onClose }: { wallet?: Wallet; onClose: () => void }) {
  const [name, setName] = useState(wallet?.name ?? '')
  const [type, setType] = useState<string>(wallet?.type ?? 'e_wallet')
  const [balance, setBalance] = useState(wallet ? String(wallet.balance) : '')
  const [run, busy] = useAction()
  const title = wallet ? 'Edit wallet' : 'Add wallet'
  const balanceBlank = balance.trim() === ''
  const balanceNum = Number(balance)
  const valid = Boolean(name.trim()) && (balanceBlank || Number.isFinite(balanceNum))

  const save = () => run(async () => {
    const trimmed = name.trim()
    const shownBalance = balanceBlank ? (wallet?.balance ?? 0) : balanceNum
    upsertCached('wallets', wallet
      ? await api.wallets.update(wallet.id, {
        name: trimmed,
        type: type as WalletType,
        ...(!balanceBlank && balanceNum !== wallet.balance ? { balance: balanceNum } : {}),
      })
      : await api.wallets.create({ name: trimmed, type: type as WalletType, balance: shownBalance }))
    onClose()
    done(wallet ? 'Changes saved' : 'Wallet added', { description: `${trimmed} · ${money(shownBalance)}` })
  })

  return (
    <ResponsivePanel
      onClose={onClose}
      title={title}
      description={wallet ? 'Update the name, type or amount.' : 'Anywhere you keep money: cash, GCash, a bank account or a card.'}
      footer={<BusyButton type="submit" form="wallet-form" busy={busy} disabled={!valid}>{wallet ? 'Save changes' : 'Add wallet'}</BusyButton>}
    >
      <form id="wallet-form" onSubmit={(e) => { e.preventDefault(); if (valid) save() }} className="grid gap-4 pb-4">
        <div className="grid gap-2">
          <Label htmlFor="wallet-name">Name</Label>
          <Input id="wallet-name" autoFocus placeholder="e.g. GCash, BPI Savings" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="wallet-type">Type</Label>
          <SimpleSelect id="wallet-type" value={type} onChange={setType} options={WALLET_TYPES} />
        </div>
        <div className="grid gap-2">
          {/* Not "balance": AntTipid isn't linked to the bank or e-wallet, so this is what the user types in. */}
          <Label htmlFor="wallet-balance">{wallet ? 'Amount in this wallet' : 'Starting amount'}</Label>
          <MoneyInput id="wallet-balance" placeholder="0" allowNegative value={balance} onChange={setBalance} aria-describedby="wallet-balance-hint" />
          <p id="wallet-balance-hint" className="text-sm text-muted-foreground">
            {wallet ? 'Change it to match what you actually have.' : "What's in it today."} Transactions you record add to or take from it.
          </p>
        </div>
      </form>
    </ResponsivePanel>
  )
}
