import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api/endpoints'
import { BusyButton } from '@/components/busy-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { useAction } from '@/hooks/use-action'
import { MAX_BACKUP_BYTES, readBackup } from '@/lib/backup'
import { done } from '@/lib/done'
import { longDate } from '@/lib/format'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const counts = (s: { wallets: number; categories: number; transactions: number; budgets: number }) =>
  `${plural(s.wallets, 'wallet')}, ${s.categories === 1 ? '1 category' : `${s.categories} categories`}, ${plural(s.transactions, 'transaction')}, ${plural(s.budgets, 'budget')}`

type Picked = { text: string; summary: ReturnType<typeof readBackup> }

export function BackupSection() {
  const [run, busy] = useAction()
  const [picked, setPicked] = useState<Picked | null>(null)
  const [copied, setCopied] = useState(false) // step 2: the safety copy is downloaded, restore is one tap away
  const advancing = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  function cancel() {
    advancing.current = false
    setCopied(false)
    setPicked(null)
  }

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = '' // so the same file can be picked again
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) return void toast.error('That file is over 4 MB, too big to restore here.')
    try {
      const text = await file.text()
      setPicked({ text, summary: readBackup(text) })
      setCopied(false)
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
        open={picked !== null && !copied}
        onOpenChange={(o) => { if (!o && !advancing.current) cancel() }}
        title="Replace everything with this backup?"
        description={s ? `From ${longDate(s.exportedOn)}: ${counts(s)}. Everything in your account now is replaced. First, download a copy of your current records.` : ''}
        confirm="Download my records"
        cancel="Keep my records"
        onConfirm={async () => {
          await api.backup.download() // if this throws, the dialog stays here and the restore never starts
          advancing.current = true // the dialog closing next is not a cancel: keep the picked file
          setCopied(true)
        }}
      />
      <ConfirmDialog
        open={picked !== null && copied}
        onOpenChange={(o) => { if (!o) cancel() }}
        title="Did your copy download?"
        description="Check that the file is saved. Replacing your records can't be undone."
        confirm="Replace my records"
        cancel="Keep my records"
        onConfirm={async () => {
          try {
            const r = await api.backup.restore(picked!.text)
            done('Backup restored', { description: plural(r.transactions, 'transaction') })
          } catch (e) {
            if ((e as { status?: number }).status !== 422) throw e
            toast.error('That backup file is damaged. Nothing was changed.')
            cancel()
          }
        }}
      />
    </section>
  )
}
