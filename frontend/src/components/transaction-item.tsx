import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { toast } from 'sonner'
import { dropCachedTransaction, invalidate } from '@/api/use-query'
import { CategoryMedia } from '@/components/category-icon'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
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

/**
 * Delete with Undo instead of a confirm step; shared by the swipe action and the details panel. The row leaves every
 * list at once, and the server delete runs only when the toast goes without Undo, so Undo just reloads: nothing to
 * re-create, and a receipt photo stays. Totals from the server (budgets, reports) catch up once the delete lands.
 * ponytail: a delete pending when the app is closed never runs, so the transaction stays; fine for a 6s window.
 */
export function deleteWithUndo(t: Transaction) {
  dropCachedTransaction(t.id)
  let settled = false
  const commit = async () => {
    if (settled) return
    settled = true
    try {
      await api.transactions.remove(t.id)
    } catch {
      toast.error(`Couldn't delete ${t.title}. Try again.`)
    }
    invalidate()
  }
  toast.success('Transaction deleted', {
    description: t.title,
    duration: 6000,
    // Sonner runs onClick before onDismiss, so Undo settles first and the dismiss that follows does nothing.
    action: { label: 'Undo', onClick: () => { settled = true; invalidate() } },
    onAutoClose: commit,
    onDismiss: commit,
  })
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
const SWIPE_HINT = 'anttipid-swipe-hint'
/** Whether to show the swipe hint: only on touch screens (the only place swipe works), only once, and not with reduced motion. */
export function shouldHintSwipe() {
  try {
    return !localStorage.getItem(SWIPE_HINT) && matchMedia('(pointer: coarse)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

export function TransactionItem({ t, swipe = false, hint = false }: { t: Transaction; swipe?: boolean; hint?: boolean }) {
  const { openDetail, openAdd } = useApp()
  const { category, wallet } = useRefData()
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{ x: number; y: number; base: number; axis?: 'x' | 'y'; lastX: number; lastT: number; vx: number } | null>(null)
  const swiped = useRef(false)
  const row = useRef<HTMLDivElement>(null)
  const open = offset < 0
  const settled = open && !dragging

  // The hint: the row slides open a little and back, once, so the actions behind it are discovered.
  useEffect(() => {
    // Checked again here: a new first row (just added) mounts with hint still on, after the nudge already ran.
    if (!hint || !shouldHintSwipe()) return
    const peek =setTimeout(() => setOffset(-56), 700)
    const back = setTimeout(() => {
      setOffset(0)
      try { localStorage.setItem(SWIPE_HINT, '1') } catch { /* private mode: it shows again next visit */ }
    }, 1500)
    return () => { clearTimeout(peek); clearTimeout(back) }
  }, [hint])

  // While open, any touch outside the row or any scroll closes it.
  useEffect(() => {
    if (!settled) return
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
  }, [settled])

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
          <Button variant="destructive" className={cn(SWIPE_ACTION, 'bg-destructive text-primary-foreground hover:bg-destructive/90')} onClick={() => { setOffset(0); deleteWithUndo(t) }}><Trash2 /> Delete</Button>
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
    </div>
  )
}
