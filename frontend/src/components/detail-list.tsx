import type { ReactNode } from 'react'

/** Label/value rows, label left and value right. */
export function DetailList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
