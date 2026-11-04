import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api/endpoints'
import { invalidate } from '@/api/use-query'
import { BusyButton } from '@/components/busy-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { useAction } from '@/hooks/use-action'
import { MAX_BACKUP_BYTES, readBackup } from '@/lib/backup'
import { done } from '@/lib/done'
import { longDate } from '@/lib/format'

type Picked = { text: string; summary: ReturnType<typeof readBackup> }

export function BackupSection() {
  const [run, busy] = useAction()
  const [picked, setPicked] = useState<Picked | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = '' // so the same file can be picked again
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) return void toast.error('That file is over 4 MB, too big to restore here.')
    try {
      const text = await file.text()
      setPicked({ text, summary: readBackup(text) })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const s = picked?.summary
  return (
    <section>
      <SectionHeader title="Backup and restore" description="Keep a copy of your records as a file, or bring one back." />
      <div className="grid justify-items-start gap-6">
        <div className="grid gap-2">
          <BusyButton variant="outline" busy={busy} onClick={() => run(api.backup.download)}><Download /> Download backup</BusyButton>
          <p className="text-sm text-muted-foreground">Wallets, categories, transactions, budgets and your decisions on unusual purchases. Receipt photos aren't included.</p>
        </div>
        <Button variant="outline" onClick={() => input.current?.click()}><Upload /> Restore from a file</Button>
        <input ref={input} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => choose(e.target.files?.[0])} />
      </div>
      <ConfirmDialog
        open={picked !== null}
        onOpenChange={(o) => { if (!o) setPicked(null) }}
        title="Replace everything with this backup?"
        description={s ? `From ${longDate(s.exportedOn)}: ${s.wallets} wallets, ${s.categories} categories, ${s.transactions} transactions, ${s.budgets} budgets. Everything in your account now is replaced. A copy of your current records downloads first.` : ''}
        confirm="Replace my records"
        cancel="Keep my records"
        onConfirm={async () => {
          // The safety copy comes first: if it fails, this throws and the restore never starts.
          await api.backup.download()
          try {
            const r = await api.backup.restore(picked!.text)
            invalidate() // every screen reloads the restored records
            done('Backup restored', { description: `${r.transactions} transactions` })
          } catch (e) {
            if ((e as { status?: number }).status === 422) throw new Error('That backup file is damaged. Nothing was changed.')
            throw e
          }
        }}
      />
    </section>
  )
}
