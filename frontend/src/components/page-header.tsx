import { useEffect, type ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

/**
 * Pages open with what the page has to say, not its name: "2 budgets need a look", not "Budgets".
 * The nav already shows where you are; the page name goes to the tab title and screen readers.
 */
export function PageHeader({ page, headline, description, action }: {
  page: string
  headline: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  useEffect(() => { document.title = `${page} | AntTipid` }, [page])
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <SidebarTrigger className="mt-1 hidden md:inline-flex" />
        <Separator orientation="vertical" className="mt-2 hidden h-6 md:block" />
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance tabular-nums md:text-3xl">
            <span className="sr-only">{page}: </span>{headline}
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground md:text-base">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}
