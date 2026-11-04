import type { ReactNode } from 'react'

/** Title, one line of help and the section's main action, above its list. */
export function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-lg leading-tight font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}
