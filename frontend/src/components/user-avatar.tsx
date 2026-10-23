import { cn } from '@/lib/utils'

/** The user's initials in a circle, standing in for a profile photo: "Juan Dela Cruz" is JC, "Andrea" is A. */
export function UserAvatar({ name, className }: { name?: string; className?: string }) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  const initials = (words.length > 1 ? words[0][0] + words.at(-1)![0] : words[0]?.[0] ?? '?').toUpperCase()
  return (
    <span aria-hidden className={cn('flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground', className)}>
      {initials}
    </span>
  )
}
