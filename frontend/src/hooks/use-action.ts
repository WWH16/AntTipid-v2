import { useState } from 'react'
import { toast } from 'sonner'

/**
 * Every save and delete goes through this: the button shows busy, a second tap is ignored,
 * and a failure becomes an error toast instead of a silent no-op. run() resolves true on success.
 */
export function useAction() {
  const [busy, setBusy] = useState(false)
  async function run(action: () => Promise<unknown>) {
    if (busy) return false
    setBusy(true)
    try {
      await action()
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  return [run, busy] as const
}
