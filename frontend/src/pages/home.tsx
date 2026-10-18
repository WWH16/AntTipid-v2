// Home answers one question first: how much can I still spend this month? Then what needs attention, then details.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PenLine, ScanLine, Settings } from 'lucide-react'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { Balance } from '@/components/balance'
import { BudgetItem } from '@/components/budget'
import { budgetState } from '@/lib/budget'
import { PageHeader } from '@/components/page-header'
import { HeroCard } from '@/components/hero-card'
import { BrandMark } from '@/components/brand-icons'
import { BillsSlide, Carousel, SpendingSlide } from '@/components/home-carousel'
import { EmptyState, ErrorState, LoadingRows } from '@/components/states'
import { TransactionItem } from '@/components/transaction-item'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { currentMonth, longDate, money, todayIso } from '@/lib/format'
import { walletTypeLabel } from '@/lib/wallets'
import type { MonthSummary } from '@/types'

export function HomePage() {
  const month = currentMonth()
  const { openAdd, user } = useApp()
  const summary = useQuery(`summary:${month}`, () => api.reports.summary(month))
  const budgets = useQuery(`budgets:${month}`, () => api.budgets.list(month))
  const recent = useQuery('recent', () => api.transactions.list({}))
  const { wallets, category } = useRefData()

  const attention = (budgets.data ?? []).filter((b) => b.categoryId && budgetState(b) !== 'ok')
  const activeWallets = wallets.filter((w) => !w.archived)
  const total = activeWallets.reduce((s, w) => s + w.balance, 0)

  const [hour] = useState(() => new Date().getHours())
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <PageHeader
        page="Home"
        headline={`${greeting}, ${user?.name.split(' ')[0] ?? 'there'}`}
        description={longDate(todayIso())}
        action={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Settings" nativeButton={false} render={<Link to="/settings" />}>
            <Settings />
          </Button>
        }
      />

      {/* minmax(0, …) tracks: the carousel scrolls inside its column instead of widening the page. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="contents lg:grid lg:grid-cols-1 lg:content-start lg:gap-6">
          <div className="order-1 grid grid-cols-1 gap-3 lg:order-none">
            <Carousel
              label="Your month so far"
              slides={[
                { title: 'Left to spend', content: summary.error ? <ErrorState error={summary.error} /> : <SafeToSpend s={summary.data} /> },
                { title: 'Spending', content: <SpendingSlide transactions={recent.data} /> },
                { title: 'Bills coming up', content: <BillsSlide transactions={recent.data} summary={summary.data} /> },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => openAdd({ kind: 'expense' })}><PenLine /> Add expense</Button>
              <Button variant="outline" onClick={() => openAdd({ kind: 'expense', scan: true })}><ScanLine /> Scan receipt</Button>
            </div>
          </div>

          <Card className="order-3 lg:order-none">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Recent activity</CardTitle>
              <CardDescription>Your latest transactions</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/activity" />}>See all</Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {recent.loading ? <LoadingRows rows={5} /> : recent.data?.length ? (
                <ItemGroup>{recent.data.slice(0, 6).map((t) => <TransactionItem key={t.id} t={t} />)}</ItemGroup>
              ) : (
                <EmptyState title="Nothing recorded yet" body="Add your first expense and it shows up here." action={<Button onClick={() => openAdd()}>Add transaction</Button>} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="contents lg:grid lg:grid-cols-1 lg:content-start lg:gap-6">
          {/* Ledge mascot keeps watch on budgets, perched on the card edge without adding height. */}
          <div className="relative order-2 lg:order-none">
          <BrandMark mark="ledge" className="pointer-events-none absolute right-6 bottom-full hidden w-12 translate-y-[12%] lg:block" />
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Needs attention</CardTitle>
              <CardDescription>Budgets near or over their limit</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/budgets" />}>All budgets</Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {budgets.loading ? <LoadingRows rows={2} /> : attention.length ? (
                <ItemGroup>
                  {attention.map((b) => <BudgetItem key={b.id} b={b} category={category(b.categoryId ?? undefined)} />)}
                </ItemGroup>
              ) : (
                <p className="text-sm text-muted-foreground">All budgets are on track.</p>
              )}
            </CardContent>
          </Card>
          </div>

          <Card className="order-4 lg:order-none">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Wallets</CardTitle>
              <CardDescription className="tabular-nums">{money(total)} across {activeWallets.length} wallets</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/settings" />}>Manage</Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ItemGroup>
                {activeWallets.map((w) => (
                  <Item key={w.id} size="sm">
                    <ItemContent>
                      <ItemTitle>{w.name}</ItemTitle>
                      <ItemDescription>{walletTypeLabel(w.type)}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Balance value={w.balance} />
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

/** What's left to spend, plus budget used vs. month gone, so being ahead of or behind pace is visible. */
function SafeToSpend({ s }: { s?: MonthSummary }) {
  if (!s) return <Skeleton className="h-56 w-full rounded-xl" />

  if (!s.budget) {
    return (
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>Set a monthly budget</CardTitle>
          <CardDescription>With a budget, Home shows how much you can still spend each day.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button nativeButton={false} render={<Link to="/budgets" />}>Set budget</Button>
        </CardFooter>
      </Card>
    )
  }

  const left = s.budget - s.spent
  const daysLeft = s.daysInMonth - s.dayOfMonth + 1 // today still counts
  const perDay = Math.max(0, left) / daysLeft
  const usedPct = Math.min(100, Math.round((s.spent / s.budget) * 100))
  const timePct = Math.round((s.dayOfMonth / s.daysInMonth) * 100)
  const gap = (s.budget * s.dayOfMonth) / s.daysInMonth - s.spent
  const over = left < 0

  return (
    <HeroCard>
        <CardHeader>
        <CardDescription>{over ? 'Over your monthly budget by' : 'Left to spend this month'}</CardDescription>
        <CardTitle className={over ? 'text-3xl font-semibold tabular-nums text-destructive' : 'text-3xl font-semibold tabular-nums'}>
          {money(Math.abs(left), { whole: true })}
        </CardTitle>
        <CardAction>
          <Badge variant="secondary">
            {over ? 'Over budget' : gap >= 0 ? 'Under pace' : 'Ahead of pace'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Progress value={usedPct}>
          <ProgressLabel>Budget used</ProgressLabel>
          <ProgressValue />
        </Progress>
        <Progress value={timePct}>
          <ProgressLabel>Month gone</ProgressLabel>
          <ProgressValue />
        </Progress>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 text-sm">
        <p className="font-medium">
          {over
            ? `You've spent ${money(s.spent, { whole: true })} of ${money(s.budget, { whole: true })}.`
            : gap >= 0
              ? `${money(gap, { whole: true })} under pace. Up to ${money(perDay, { whole: true })} a day keeps you on budget.`
              : `${money(-gap, { whole: true })} ahead of pace. Keep to ${money(perDay, { whole: true })} a day to finish on budget.`}
        </p>
        <p className="text-muted-foreground">
          {money(s.spent, { whole: true })} spent of {money(s.budget, { whole: true })}, {daysLeft === 1 ? 'last day of the month' : `${daysLeft} days left`}
        </p>
      </CardFooter>
    </HeroCard>
  )
}
