import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { CategoryMedia } from '@/components/category-icon'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
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

/** Confirm step before a delete; shared by the swipe action and the details panel. */
export function DeleteTransactionDialog({ t, open, onOpenChange, onDeleted }: {
  t?: Transaction
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete this transaction?"
      description={`${t?.title} will be removed and your wallet balance and budgets will update. This can't be undone.`}
      confirm="Delete transaction"
      onConfirm={async () => {
        if (!t) return
        await api.transactions.remove(t.id)
        done('Transaction deleted', { description: t.title })
        onDeleted?.()
      }}
    />
  )
}

const ACTIONS_WIDTH = 144 // two 72px action buttons revealed by a left swipe
const SWIPE_ACTION = 'h-full flex-1 flex-col gap-1 rounded-none text-xs'
// px per ms: a release faster than this opens or closes the row whatever its position, like a native list.
const FLICK = 0.4
// Closes the row whose actions are showing, so only one row is open at a time.
let closeOpenRow: (() => void) | null = null

/**
 * One transaction as a shadcn Item; tap opens details, swipe left (touch) reveals Edit and Delete.
 * The swipe follows native lists: one row open at a time; a flick opens or closes it; dragging past the
 * actions stretches them with resistance; scrolling or touching anywhere else closes it, and that touch
 * only closes it (it doesn't also open another row).
 * Only the Activity history passes `swipe`; elsewhere (Home, sheets) a row just opens its details.
 */
export function TransactionItem({ t, swipe = false }: { t: Transaction; swipe?: boolean }) {
  const { openDetail, openAdd } = useApp()
  const { category, wallet } = useRefData()
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const gesture = useRef<{ x: number; y: number; base: number; axis?: 'x' | 'y'; lastX: number; lastT: number; vx: number } | null>(null)
  const swiped = useRef(false)
  const row = useRef<HTMLDivElement>(null)
  const open = offset < 0
  const settled = open && !dragging

  // While open (and not asking to confirm a delete, whose dialog sits outside the row), any touch outside
  // the row or any scroll closes it.
  useEffect(() => {
    if (!settled || confirming) return
    const close = () => setOffset(0)
    if (closeOpenRow !== close) closeOpenRow?.()
    closeOpenRow = close
    const onDown = (e: Event) => {
      if (row.current?.contains(e.target as Node)) return
      close()
      // The touch that closes a row does only that: swallow the click it would end in.
      const swallow = (c: Event) => { c.stopPropagation(); c.preventDefault() }
      document.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 500)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', close, { capture: true, passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', close, { capture: true })
      if (closeOpenRow === close) closeOpenRow = null
    }
  }, [settled, confirming])

  const description = t.kind === 'transfer'
    ? `${wallet(t.walletId)?.name ?? 'Wallet'} to ${wallet(t.toWalletId)?.name ?? 'wallet'}`
    : `${category(t.categoryId)?.name ?? 'Uncategorised'}, ${wallet(t.walletId)?.name ?? ''}${t.source === 'receipt' ? ', scanned receipt' : ''}`

  // Touch only; vertical moves are left to page scrolling (touch-action: pan-y).
  function onPointerDown(e: PointerEvent) {
    if (!swipe || e.pointerType === 'mouse') return
    gesture.current ={ x: e.clientX, y: e.clientY, base: offset, lastX: e.clientX, lastT: e.timeStamp, vx: 0 }
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
    if (g.axis !== 'x') return
    if (e.timeStamp > g.lastT) g.vx = (e.clientX - g.lastX) / (e.timeStamp - g.lastT)
    g.lastX = e.clientX
    g.lastT = e.timeStamp
    // Past the actions the row keeps moving at a quarter of the finger's pace; it never moves right of closed.
    const x = Math.min(0, g.base + dx)
    setOffset(x < -ACTIONS_WIDTH ? -ACTIONS_WIDTH + (x + ACTIONS_WIDTH) / 4 : x)
  }
  function onPointerEnd(e: PointerEvent) {
    const g = gesture.current
    if (g?.axis === 'x') {
      // A finger that stopped before lifting isn't a flick, however fast it moved earlier.
      const flick = e.timeStamp - g.lastT < 100 && Math.abs(g.vx) > FLICK
      setOffset((o) => ((flick ? g.vx < 0 : o < -ACTIONS_WIDTH / 2) ? -ACTIONS_WIDTH : 0))
    }
    gesture.current = null
    setDragging(false)
  }

  return (
    <div ref={row} role="listitem" className="relative overflow-hidden rounded-lg">
      {open && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(ACTIONS_WIDTH, -offset) }}>
          <Button variant="secondary" className={SWIPE_ACTION} onClick={() => { setOffset(0); openAdd({ edit: t }) }}><Pencil /> Edit</Button>
          <Button variant="destructive" className={cn(SWIPE_ACTION, 'bg-destructive text-primary-foreground hover:bg-destructive/90')} onClick={() => setConfirming(true)}><Trash2 /> Delete</Button>
        </div>
      )}
      <Item
        size="xs"
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
        className={cn('relative touch-pan-y bg-card py-1.5 text-left hover:bg-muted', !dragging && 'transition-transform duration-200 ease-out')}
      >
        <CategoryMedia category={category(t.categoryId)} kind={t.kind} />
        <ItemContent className="min-w-0">
          <ItemTitle className="block truncate leading-tight">{t.title}</ItemTitle>
          <ItemDescription className="line-clamp-1 leading-tight">{description}</ItemDescription>
        </ItemContent>
        <ItemActions><SignedAmount t={t} /></ItemActions>
      </Item>
      <DeleteTransactionDialog t={t} open={confirming} onOpenChange={setConfirming} onDeleted={() => setOffset(0)} />
    </div>
  )
}
