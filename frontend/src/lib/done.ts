import { toast, type ExternalToast } from 'sonner'
import { invalidate } from '@/api/use-query'

/** After a successful change: reload every screen's data and confirm with a toast. */
export function done(message: string, options?: ExternalToast) {
  invalidate()
  toast.success(message, options)
}
