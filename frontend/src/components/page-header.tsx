import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '@/app-state'
import { UserAvatar } from '@/components/user-avatar'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

/**
 * Pages open with what the page has to say, not its name: "2 budgets need a look", not "Budgets".
 * The nav already shows where you are; the page name goes to the tab title and screen readers.
 * On phones the bottom bar has no room for Settings, so every page's header carries the user's avatar, which opens it.
 */
export function PageHeader({ page, headline, description, action }: {
  page: string
  headline: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  const { user } = useApp()
  useEffect(() => { document.title = `${page} | AntTipid` }, [page])
  const avatar = page !== 'Settings' && (
    // 36px circle, 44px to the thumb.
    <Link to="/settings" aria-label="Settings" className="relative rounded-full outline-none after:absolute after:-inset-1 focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden">
      <UserAvatar name={user?.name} />
    </Link>
  )
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <SidebarTrigger className="mt-1 hidden md:inline-flex" />
        <Separator orientation="vertical" className="mt-2 hidden h-6 md:block" />
        <div className="min-w-0">
          <h1 className="text-xl leading-tight font-semibold tracking-tight text-balance tabular-nums sm:text-2xl md:text-3xl">
            {headline !== page && <span className="sr-only">{page}: </span>}{headline}
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground md:text-base">{description}</p>}
        </div>
      </div>
      {(action || avatar) && <div className="flex shrink-0 items-center gap-2">{action}{avatar}</div>}
    </header>
  )
}
