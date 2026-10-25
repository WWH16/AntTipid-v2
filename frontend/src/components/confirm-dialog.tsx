// One confirm step for every delete, so they all read and behave the same.
import { Loader2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAction } from '@/hooks/use-action'

export function ConfirmDialog({ open, onOpenChange, title, description, confirm, cancel = 'Keep it', onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirm: string // the action, e.g. "Delete category"
  cancel?: string // what not confirming keeps: "Keep it" for a delete, "Keep editing" for a discard
  onConfirm: () => Promise<unknown>
}) {
  const [run, busy] = useAction()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* The phone's width less a 16px margin each side, not the stock 320px cap, so both buttons fit on one line. */}
      <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Side by side on phones too, as the dialog's own small size does: two short choices read as a pair.
            Cancel on the left, the action on the right. On the narrowest phones a long label ("Delete transaction")
            wraps to two lines rather than spilling out of its half. */}
        <AlertDialogFooter className="grid grid-cols-2 sm:flex [&>*]:h-auto [&>*]:min-h-9 [&>*]:py-1.5 [&>*]:whitespace-normal">
          <AlertDialogCancel disabled={busy}>{cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={async () => { if (await run(onConfirm)) onOpenChange(false) }}>
            {busy && <Loader2 className="animate-spin" />}
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
