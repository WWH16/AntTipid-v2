import type { ComponentProps } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Button that shows a spinner and stays disabled while its action runs. */
export function BusyButton({ busy, disabled, children, ...props }: ComponentProps<typeof Button> & { busy: boolean }) {
  return (
    <Button disabled={disabled || busy} aria-busy={busy || undefined} {...props}>
      {busy && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  )
}
