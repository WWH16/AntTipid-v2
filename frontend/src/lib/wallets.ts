import type { WalletType } from '@/types'

export const WALLET_TYPES: { value: WalletType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'e_wallet', label: 'E-wallet' },
  { value: 'bank', label: 'Bank account' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
]

export const walletTypeLabel = (type: WalletType) => WALLET_TYPES.find((t) => t.value === type)?.label ?? type
