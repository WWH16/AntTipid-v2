// Details for one transaction, opened by tapping any row. Edit reopens the add panel prefilled; Delete offers Undo.
import { useState } from 'react'
import { Pencil, Repeat, ScanSearch, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { invalidate, useQuery } from '@/api/use-query'
import { deleteWithUndo, KIND_LABEL, useAnomalies } from '@/lib/transactions'
import { DetailList } from '@/components/detail-list'
import { ReceiptItems } from '@/components/receipt-items'
import { BusyButton } from '@/components/busy-button'
import { ResponsivePanel } from '@/components/responsive-panel'
import { SignedAmount } from '@/components/transaction-item'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useAction } from '@/hooks/use-action'
import { unusualLine } from '@/lib/budget'
import { longDate, money } from '@/lib/format'
import type { AnomalyDecision, SimilarOneOff, Transaction } from '@/types'

export function TransactionSheet() {
  const { detailId } = useApp()
  return detailId ? <Details key={detailId} id={detailId} /> : null
}

function Details({ id }: { id: string }) {
  const { openAdd, closeDetail } = useApp()
  const { category, wallet } = useRefData()
  const { data: t, error } = useQuery(`transaction:${id}`, () => api.transactions.get(id))

  const rows: [string, string][] = !t ? [] : [
    ['Type', KIND_LABEL[t.kind]],
    ...(t.kind === 'transfer'
      ? [['From', wallet(t.walletId)?.name ?? '—'], ['To', wallet(t.toWalletId)?.name ?? '—']]
      : [['Category', category(t.categoryId)?.name ?? 'Uncategorised'], [t.kind === 'income' ? 'Into wallet' : 'Paid from', wallet(t.walletId)?.name ?? '—']]) as [string, string][],
    ['Date', longDate(t.date)],
  ]

  return (
    <ResponsivePanel
      onClose={closeDetail}
      title={t?.title ?? 'Transaction'}
      description="Transaction details"
      footer={t && (
        <>
          {/* Repeats (fare, load, lunch): the same transaction again, dated today, ready to save or adjust. */}
          <Button variant="outline" onClick={() => openAdd({ copy: t })}><Repeat /> Add again</Button>
          <Button variant="outline" onClick={() => openAdd({ edit: t })}><Pencil /> Edit</Button>
          <Button variant="destructive" onClick={() => { closeDetail(); deleteWithUndo(t) }}><Trash2 /> Delete</Button>
        </>
      )}
    >
      {error ? <p className="text-sm text-destructive">This transaction no longer exists.</p> : !t ? (
        <div aria-busy className="grid gap-4 pb-4">
          <Skeleton className="h-8 w-36" />
          <Separator />
          <div className="grid gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between gap-4"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-32" /></div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <SignedAmount t={t} className="text-2xl font-semibold" />
            {t.source === 'receipt' && <Badge variant="secondary">Scanned receipt</Badge>}
          </div>
          <UnusualNote t={t} />
          <Separator />
          <DetailList rows={rows} />
          {!!t.items?.length && (
            <>
              <Separator />
              <ReceiptItems items={t.items} total={t.amount} />
            </>
          )}
          {t.receiptUrl && (
            <>
              <Separator />
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">Receipt photo</p>
                <a href={t.receiptUrl} target="_blank" rel="noreferrer" className="justify-self-start">
                  <img src={t.receiptUrl} alt={`Receipt for ${t.title}`} className="max-h-48 rounded-md border object-cover" />
                </a>
              </div>
            </>
          )}
          {t.note && (
            <>
              <Separator />
              <div className="grid gap-1 text-sm">
                <p className="text-muted-foreground">Note</p>
                <p className="whitespace-pre-line">{t.note}</p>
              </div>
            </>
          )}
        </div>
      )}

    </ResponsivePanel>
  )
}

/**
 * A flagged purchase (DSS feature 9): the verdict as it was when saved (it never changes later), and the user's
 * decision, changeable any time with Undo. "It's normal for me" with earlier one-offs like it asks once about them too.
 */
function UnusualNote({ t }: { t: Transaction }) {
  const { category } = useRefData()
  const { data } = useAnomalies(t.date.slice(0, 7))
  const [run, busy] = useAction()
  const [earlier, setEarlier] = useState<SimilarOneOff[]>([])
  const a = data?.find((x) => x.transactionId === t.id)
  if (!a) return null
  const name = category(a.categoryId)?.name ?? 'this category'

  const decide = (decision: AnomalyDecision, alsoEarlier = false) => run(async () => {
    const before = a.decision
    const left = await api.anomalies.decide(t.id, decision, alsoEarlier)
    // "Normal" with earlier one-offs like it: ask once. The lists refresh after the answer, or this note (no longer
    // flagged) would close before it's asked.
    if (decision === 'normal' && !alsoEarlier && left.length) setEarlier(left)
    else { setEarlier([]); invalidate() }
    toast.success(decision === 'normal' ? 'Marked as normal spending' : 'Saved as a one-off', {
      description: t.title,
      duration: 6000, // the same Undo window as delete
      action: { label: 'Undo', onClick: () => { api.anomalies.decide(t.id, before).then(invalidate, (e: Error) => toast.error(e.message)) } },
    })
  })

  return (
    <div className="grid gap-3 rounded-lg bg-destructive/5 p-3 text-sm">
      <div className="flex items-start gap-2.5">
        <ScanSearch aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="grid gap-1">
          <p className="font-medium">{a.decision === 'one_off' ? `A one-off for ${name}` : `Unusual for ${name}: needs your review`}</p>
          <p className="text-muted-foreground">
            {unusualLine(a, name)} {a.decision === 'one_off' ? 'It stays out of your daily pace and doesn\'t teach your habits.' : 'Until you decide, it stays out of your daily pace.'}
          </p>
        </div>
      </div>
      {earlier.length > 0 ? (
        <AskEarlier earlier={earlier} busy={busy} onAnswer={(also) => { if (also) decide('normal', true); else { setEarlier([]); invalidate() } }} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {a.decision !== 'one_off' && <BusyButton variant="outline" size="sm" busy={busy} onClick={() => decide('one_off')}>It's a one-off</BusyButton>}
          <BusyButton variant="outline" size="sm" busy={busy} onClick={() => decide('normal')}>It's normal for me</BusyButton>
        </div>
      )}
    </div>
  )
}

/** After "It's normal for me" with earlier one-offs like it (DSS feature 9): count them as normal too? Asked once. */
export function AskEarlier({ earlier, busy = false, onAnswer }: { earlier: SimilarOneOff[]; busy?: boolean; onAnswer: (alsoEarlier: boolean) => void }) {
  return (
    <div className="grid gap-2 border-t border-destructive/15 pt-3">
      <p className="font-medium">
        {earlier.length === 1
          ? `Also count your ${money(earlier[0].amount, { whole: true })} one-off on ${longDate(earlier[0].date)} as normal?`
          : `Also count your ${earlier.length} earlier one-offs like this as normal?`}
      </p>
      <div className="flex flex-wrap gap-2">
        <BusyButton type="button" size="sm" busy={busy} onClick={() => onAnswer(true)}>Yes, count {earlier.length === 1 ? 'it' : 'them'} too</BusyButton>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onAnswer(false)}>Only this one</Button>
      </div>
    </div>
  )
}
