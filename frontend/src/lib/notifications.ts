import { dayLabel, manilaDate } from './format.ts'

/** "5m ago" and "3h ago" for the last day, how notification lists elsewhere say when. Older ones read like Activity. */
export function notificationTime(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`
  return dayLabel(manilaDate.format(then))
}

/**
 * Whether a reload brought something new to toast. `items` are newest first; a null `lastSeen` means the first load,
 * which only takes note of where things stand.
 */
export function nextToast(lastSeen: number | null, items: { id: number; title: string }[]): { title: string | null; lastSeen: number } {
  const newest = items[0]
  const id = newest?.id ?? 0
  if (lastSeen === null) return { title: null, lastSeen: id }
  return id > lastSeen ? { title: newest.title, lastSeen: id } : { title: null, lastSeen }
}
