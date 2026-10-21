import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BrandMark } from '@/components/brand-icons'
import { HeroCard } from '@/components/hero-card'
import { LogoWithTagline } from '@/components/logo'
import { cn } from '@/lib/utils'

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Empty className="border border-dashed p-6">
      <EmptyHeader>
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-muted/60 p-1">
          <BrandMark mark="tile" className="size-full" />
        </div>
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
export function LoadingCard({ children }: { children: ReactNode }) {
  return (
    <Card aria-busy>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Whole page while its code downloads or the session is read: header, then a list card. */
export function LoadingPage() {
  return (
    <div aria-busy className="grid gap-6">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-64 max-w-full md:h-9" />
        <Skeleton className="h-4 w-48" />
      </div>
      <LoadingCard><LoadingItems rows={5} /></LoadingCard>
    </div>
  )
}

/** The sign-in screen while its code downloads or the session is read: logo, then the card with two fields.
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
            {/* The password label row is 2px taller: "Forgot password?" sits beside it. */}
            {['h-3.5 w-10', 'my-px h-3.5 w-16'].map((label) => (
              <div key={label} className="grid gap-2">
                <Skeleton className={label} />
                <Skeleton className="h-9 w-full rounded-lg pointer-coarse:h-11" />
              </div>
            ))}
            <Skeleton className="h-9 w-full rounded-lg pointer-coarse:h-11" />
            <Skeleton className="mx-auto my-1 h-3 w-52" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
