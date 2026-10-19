import { useRef, useState, type PointerEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { CategoryMedia } from '@/components/category-icon'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { useIsMobile } from '@/hooks/use-mobile'
import { done } from '@/lib/done'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types'

/** Amount with its sign. Income uses the primary green; expenses stay foreground. */
export function SignedAmount({ t, className }: { t: Transaction; className?: string }) {
  const sign = t.kind === 'expense' ? '-' : t.kind === 'income' ? '+' : ''
  return (
    <span className={cn('font-medium tabular-nums', t.kind === 'income' && 'text-primary', t.kind === 'transfer' && 'text-muted-foreground', className)}>
      {sign}{money(t.amount)}
    </span>
  )
}

/** Shared by the swipe action and the details panel. Returns true when deleted. */
async function deleteTransaction(t: Transaction) {
  try {
    await api.transactions.remove(t.id)
    done('Transaction deleted', { description: t.title })
    return true
  } catch (e) {
    toast.error((e as Error).message)
    return false
  }
}

/** Confirm step before a delete; same wording wherever a transaction is deleted. */
export function DeleteTransactionDialog({ t, open, onOpenChange, onDeleted }: {
  t?: Transaction
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
          <AlertDialogDescription>
            {t?.title} will be removed and your wallet balance and budgets will update. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={async () => { if (t && (await deleteTransaction(t))) onDeleted?.() }}>
            Delete transaction
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const ACTIONS_WIDTH = 144 // two 72px action buttons revealed by a left swipe
const SWIPE_ACTION = 'h-full flex-1 flex-col gap-1 rounded-none text-xs'

/** One transaction as a shadcn Item; tap opens details, swipe left (touch) reveals Edit and Delete. */
export function TransactionItem({ t }: { t: Transaction }) {
  const { openDetail, openAdd } = useApp()
  const { category, wallet } = useRefData()
  const isMobile = useIsMobile()
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const gesture = useRef<{ x: number; y: number; base: number; axis?: 'x' | 'y' } | null>(null)
  const swiped = useRef(false)
  const open = offset < 0

  const description = t.kind === 'transfer'
    ? `${wallet(t.walletId)?.name ?? 'Wallet'} to ${wallet(t.toWalletId)?.name ?? 'wallet'}`
    : `${category(t.categoryId)?.name ?? 'Uncategorised'}, ${wallet(t.walletId)?.name ?? ''}${t.source === 'receipt' ? ', scanned receipt' : ''}`

  // Touch only; vertical moves are left to page scrolling (touch-action: pan-y).
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return
    gesture.current = { x: e.clientX, y: e.clientY, base: offset }
    swiped.current = false
  }
  function onPointerMove(e: PointerEvent) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (g.axis === 'x') {
        // Throws if the finger already lifted (fast flick); the swipe still works without capture.
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer gone */ }
        setDragging(true)
        swiped.current = true
      }
    }
    if (g.axis === 'x') setOffset(Math.max(-ACTIONS_WIDTH, Math.min(0, g.base + dx)))
  }
  function onPointerEnd() {
    if (gesture.current?.axis === 'x') setOffset((o) => (o < -ACTIONS_WIDTH / 2 ? -ACTIONS_WIDTH : 0))
    gesture.current = null
    setDragging(false)
  }

  return (
    <div role="listitem" className="relative overflow-hidden rounded-lg">
      {open && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_WIDTH }}>
          <Button variant="secondary" className={SWIPE_ACTION} onClick={() => { setOffset(0); openAdd({ edit: t }) }}><Pencil /> Edit</Button>
          <Button variant="destructive" className={cn(SWIPE_ACTION, 'bg-destructive text-primary-foreground hover:bg-destructive/90')} onClick={() => setConfirming(true)}><Trash2 /> Delete</Button>
        </div>
      )}
      <Item
        size={isMobile ? 'xs' : 'default'}
        render={
          <button
            type="button"
            onClick={() => {
              if (swiped.current) { swiped.current = false; return }
              if (open) setOffset(0)
              else openDetail(t.id)
            }}
          />
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{ transform: `translateX(${offset}px)` }}
        className={cn('relative touch-pan-y bg-card text-left hover:bg-muted', !dragging && 'transition-transform duration-200 ease-out')}
      >
        <CategoryMedia category={category(t.categoryId)} kind={t.kind} />
        <ItemContent className="min-w-0">
          <ItemTitle className="truncate">{t.title}</ItemTitle>
          <ItemDescription>{description}</ItemDescription>
        </ItemContent>
        <ItemActions><SignedAmount t={t} /></ItemActions>
      </Item>
      <DeleteTransactionDialog t={t} open={confirming} onOpenChange={setConfirming} onDeleted={() => setOffset(0)} />
    </div>
  )
}
