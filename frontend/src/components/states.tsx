import type { ReactNode } from 'react'
import { CircleAlert, Plus, type LucideIcon } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { HeroCard } from '@/components/hero-card'
import { LogoWithTagline } from '@/components/logo'
import { cn } from '@/lib/utils'

/** Framed (dashed border) only when it stands alone on a page; inside a card, the card is the frame. */
export function EmptyState({ icon: Icon, title, body, action, framed }: { icon: LucideIcon; title: string; body: string; action?: ReactNode; framed?: boolean }) {
  return (
    <Empty className={framed ? 'border p-6' : 'p-0 py-4'}>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Couldn't load this</AlertTitle>
      <AlertDescription>{error.message}. Check your connection, then reload the page.</AlertDescription>
    </Alert>
  )
}

// Loading placeholders drawn in the shape of what replaces them, so nothing jumps when data lands.
const W = ['w-2/5', 'w-1/2', 'w-1/3']

/** Rows shaped like an Item: category icon, title and description, trailing amount (or progress bar). */
export function LoadingItems({ rows = 4, progress, amount = true }: { rows?: number; progress?: boolean; amount?: boolean }) {
  return (
    <div aria-busy className="grid gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid gap-2.5 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 shrink-0" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className={cn('h-4', W[i % 3])} />
              {amount && <Skeleton className={cn('h-3', W[(i + 1) % 3])} />}
            </div>
            {amount && <Skeleton className="h-4 w-16" />}
          </div>
          {progress && <Skeleton className="h-1.5 w-full" />}
        </div>
      ))}
    </div>
  )
}

/** The dark-green hero card while its numbers load. Compact is the Budgets one: one bar, one footer row. */
export function LoadingHero({ compact }: { compact?: boolean }) {
  return (
    <HeroCard aria-busy>
      <CardHeader>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-44" />
      </CardHeader>
      <CardContent className="grid gap-4">
        <Skeleton className="h-2 w-full" />
        {!compact && <Skeleton className="h-2 w-full" />}
      </CardContent>
      {compact ? (
        <CardFooter className="justify-between gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-12" />
        </CardFooter>
      ) : (
        <CardFooter className="flex-col items-start gap-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </CardFooter>
      )}
    </HeroCard>
  )
}

/** A titled card with placeholder content. */
export function LoadingCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card aria-busy className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Budgets while its data loads: the compact hero beside the budget list. */
export function LoadingBudgets() {
  return (
    <div aria-busy className="grid items-start gap-5 md:gap-6 lg:grid-cols-[2fr_3fr]">
      <LoadingHero compact />
      <LoadingCard><LoadingItems rows={3} progress /></LoadingCard>
    </div>
  )
}

/** The report bento's shape, like the loaded report: totals stacked beside the month chart, then breakdown and calendar. */
export function LoadingReport() {
  return (
    <div aria-busy className="@container/report grid grid-cols-12 gap-3 md:gap-4">
      {[0, 1, 2].map((i) => (
        <Card key={i} className={cn(i === 2 ? 'col-span-12' : 'col-span-6', '@md:col-span-4')}>
          <CardHeader>
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-7 w-20 sm:w-28" />
          </CardHeader>
        </Card>
      ))}
      <LoadingCard className="col-span-12 @4xl:col-span-8 @4xl:col-start-5 @4xl:row-span-3 @4xl:row-start-1"><Skeleton className="h-56 w-full sm:h-64 @4xl:h-80" /></LoadingCard>
      <LoadingCard className="col-span-12 @4xl:col-span-8"><LoadingItems rows={4} amount={false} progress /></LoadingCard>
      <LoadingCard className="col-span-12 @4xl:col-span-4"><Skeleton className="h-64 w-full" /></LoadingCard>
    </div>
  )
}

/** Activity's list: two day groups, like the loaded list. */
export function LoadingDays() {
  return (
    <Card aria-busy>
      <CardContent className="grid gap-2 md:gap-4">
        {[3, 2].map((rows, i) => (
          <div key={rows} className="grid gap-1">
            {i > 0 && <Separator className="mb-2 md:mb-3" />}
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
            <LoadingItems rows={rows} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** A signed-in page while its code downloads, shaped like that page loading its data, so the code arriving swaps in
 *  without a jump. Fills the shell's main area, so it brings no padding. */
export function LoadingPage() {
  const page = useLocation().pathname.split('/')[1]
  const month = ['activity', 'budgets', 'reports'].includes(page)
  return (
    <div aria-busy className="contents">
      {/* PageHeader: sidebar toggle and divider on wider screens, headline and its line, the phone's avatar on the right. */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Skeleton className="mt-1 hidden size-7 md:block" />
          <div className="mt-2 hidden h-6 w-px bg-border md:block" />
          <div className="grid min-w-0 flex-1 gap-2.5 pt-1">
            <Skeleton className="h-6 w-56 max-w-full sm:h-7 md:h-8 md:w-72" />
            <Skeleton className="h-4 w-40 max-w-full" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {month && <Skeleton className="h-8 w-8 sm:w-28" />}
          <Skeleton className="size-9 rounded-full md:hidden" />
        </div>
      </div>
      {/* MonthSwitcher's pill, at its row height. */}
      {month && <div className="py-2"><Skeleton className="h-10 w-48 rounded-full" /></div>}
      {page === 'activity' ? (
        <div className="grid gap-5 md:gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="grid gap-4 lg:order-2">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg md:w-80 lg:w-full" />
          </div>
          <div className="lg:order-1"><LoadingDays /></div>
        </div>
      ) : page === 'budgets' ? <LoadingBudgets /> : page === 'reports' ? <LoadingReport /> : page === 'settings' ? (
        <div className="grid max-w-5xl items-start gap-4 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="gap-0 py-2"><LoadingItems rows={6} amount={false} /></Card>
          <Card className="max-md:hidden md:p-6"><LoadingItems rows={4} amount={false} /></Card>
        </div>
      ) : (
        // Home: the month so far beside wallets, then recent activity.
        <div className="@container grid grid-cols-12 gap-3 md:gap-4">
          <div className="col-span-12 grid gap-3 @4xl:col-span-8">
            <LoadingHero />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-8 rounded-lg" />
              <Skeleton className="h-8 rounded-lg" />
            </div>
          </div>
          <LoadingCard className="col-span-12 @4xl:col-span-4"><LoadingItems rows={3} /></LoadingCard>
          <LoadingCard className="col-span-12"><LoadingItems rows={5} /></LoadingCard>
        </div>
      )}
    </div>
  )
}

/** A page outside the shell (print preview, help documents) while its code downloads: header, then a text card. */
export function LoadingDocument() {
  return (
    <div aria-busy className="mx-auto grid w-full max-w-3xl gap-6 p-4 md:p-6">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-64 max-w-full md:h-9" />
        <Skeleton className="h-4 w-48" />
      </div>
      <LoadingCard><div className="grid gap-2.5">{W.concat(W).map((w, i) => <Skeleton key={i} className={cn('h-4', i % 3 === 2 ? w : 'w-full')} />)}</div></LoadingCard>
    </div>
  )
}

const SIDEBAR_BAR = 'bg-sidebar-foreground/12'

/** The signed-in shell before its code or the session is ready: the same dark sidebar (tablet and laptop) or bottom bar
 *  (phone), and the current page's shape in the same main area, so the real shell lands on top of it. */
export function LoadingShell() {
  return (
    <div aria-busy className="flex min-h-svh w-full">
      <div className="hidden w-64 shrink-0 md:block">
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar canvas-dark-flat text-sidebar-foreground">
          <div className="px-4 py-3"><LogoWithTagline tone="dark" height={37} small /></div>
          <div className="flex flex-col gap-2 p-2">
            {/* The Add button is the same on every page, so it shows as itself (it works once the shell lands). */}
            <div className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-sidebar-primary text-sm font-medium text-sidebar-primary-foreground"><Plus className="size-4" /> Add transaction</div>
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex h-8 items-center gap-2 px-2">
                <Skeleton className={cn('size-4', SIDEBAR_BAR)} />
                <Skeleton className={cn('h-3.5', SIDEBAR_BAR, W[i % 3])} />
              </div>
            ))}
          </div>
          <div className="m-2 mt-auto grid h-12 content-center gap-1.5 px-2">
            <Skeleton className={cn('h-3.5 w-28', SIDEBAR_BAR)} />
            <Skeleton className={cn('h-3 w-40', SIDEBAR_BAR)} />
          </div>
        </div>
      </div>
      <div data-slot="sidebar-inset" className="relative flex w-full min-w-0 flex-1 flex-col bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:gap-6 md:p-6">
          <LoadingPage />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar canvas-dark pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid grid-cols-5 items-center gap-1 p-2">
          {[0, 1, 2, 3, 4].map((i) => i === 2
            ? <div key={i} className="flex size-14 -translate-y-4 items-center justify-center justify-self-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-black/30 ring-4 ring-sidebar"><Plus className="size-6" /></div>
            : (
              <div key={i} className="flex flex-col items-center gap-1 py-1.5">
                <Skeleton className={cn('size-4', SIDEBAR_BAR)} />
                <Skeleton className={cn('h-3 w-10', SIDEBAR_BAR)} />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

/** The sign-in screen while its code downloads or the session is read: logo, then the card with the Google button and two fields.
 *  Bars sit inside the line boxes of the text they stand for (my-1), so the real card lands at the same height. */
export function LoadingAuth() {
  return (
    <div aria-busy className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="self-center"><LogoWithTagline /></div>
        <Card>
          <CardHeader>
            <Skeleton className="my-1 h-3.5 w-48" />
            <Skeleton className="my-1 h-3 w-56 max-w-full" />
          </CardHeader>
          <CardContent className="grid gap-6">
            <Skeleton className="h-9 w-full rounded-lg" />
            {/* The "or" divider is one 16px line of text-xs. */}
            <Skeleton className="mx-auto my-1 h-2 w-8" />
            {/* The password label row is 2px taller: "Forgot password?" sits beside it. */}
            {['h-3.5 w-10', 'my-px h-3.5 w-16'].map((label) => (
              <div key={label} className="grid gap-2">
                <Skeleton className={label} />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ))}
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="mx-auto my-1 h-3 w-52" />
          </CardContent>
        </Card>
        {/* The "Privacy policy" link: one 16px line of text-xs. */}
        <Skeleton className="my-1 h-2 w-20 self-center" />
      </div>
    </div>
  )
}
