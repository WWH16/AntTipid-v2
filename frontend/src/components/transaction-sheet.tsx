// Details for one transaction, opened by tapping any row. Edit reopens the add panel prefilled; Delete offers Undo.
import { Pencil, Repeat, Trash2 } from 'lucide-react'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { deleteWithUndo, KIND_LABEL } from '@/lib/transactions'
import { DetailList } from '@/components/detail-list'
import { ReceiptItems } from '@/components/receipt-items'
import { ResponsivePanel } from '@/components/responsive-panel'
import { SignedAmount } from '@/components/transaction-item'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { longDate } from '@/lib/format'

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
