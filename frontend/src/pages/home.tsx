// Home answers one question first: how much can I still spend this month? Then what needs attention, then details.
import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, PenLine, ScanLine } from 'lucide-react'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { BudgetItem } from '@/components/budget'
import { fixedPart, leavesOut, needsLook } from '@/lib/budget'
import { PageHeader } from '@/components/page-header'
import { SafeToSpendCard } from '@/components/safe-to-spend-card'
import { BrandMark } from '@/components/brand-icons'
import { CategoriesSlide, Carousel, SpendingSlide } from '@/components/home-carousel'
import { ErrorState, LoadingHero, LoadingItems } from '@/components/states'
import { TransactionItem } from '@/components/transaction-item'
import { WalletItem } from '@/components/wallet-item'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { currentMonth, longDate, money, shiftMonth, todayIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BudgetStatus, MonthSummary } from '@/types'

export function HomePage() {
  const month = currentMonth()
  const { openAdd, user } = useApp()
  const summary = useQuery(`summary:${month}`, () => api.reports.summary(month))
  const budgets = useQuery(`budgets:${month}`, () => api.budgets.list(month))
  // Last month and this one: the carousel compares against last month, and the newest six fill Recent activity.
  // ponytail: someone idle for two months sees an empty list and the setup's expense step again; add a limit query if that matters.
  const recent = useQuery(`recent:${month}`, () => api.transactions.list({ since: `${shiftMonth(month, -1)}-01` }))
  const { wallets, category, loading: refLoading } = useRefData()

  const attention = (budgets.data ?? []).filter((b) => b.categoryId && needsLook(b, category(b.categoryId)?.onceAMonth))
  const activeWallets = wallets.filter((w) => !w.archived)
  const total = activeWallets.reduce((s, w) => s + w.balance, 0)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const [setupHidden, setSetupHidden] = useState(() => { try { return localStorage.getItem(SETUP_HIDDEN) === '1' } catch { return false } })
  const setup = !refLoading && summary.data && recent.data && !setupHidden
    ? { hasWallet: activeWallets.length > 0, hasBudget: summary.data.budget > 0, hasExpense: recent.data.some((t) => t.kind === 'expense') }
    : null
  const showSetup = setup && !(setup.hasWallet && setup.hasBudget && setup.hasExpense)
  // While setup is showing, its budget step stands in for the "Set a monthly budget" slide.
  const noLeftSlide = !!showSetup && !setup.hasBudget
  // The spending slides wait for a first expense (they'd be all ₱0 and empty bars); while that list loads they show.
  // With neither a budget nor an expense, there's no carousel: the setup card says what to do first.
  const hasSpending = recent.data ? recent.data.some((t) => t.kind === 'expense') : true
  const slides = [
    ...(noLeftSlide ? [] : [{ title: 'Left to spend', content: summary.error ? <ErrorState error={summary.error} /> : <SafeToSpend s={summary.data} budgets={budgets.data} /> }]),
    ...(hasSpending ? [
      { title: 'Spending', content: <SpendingSlide transactions={recent.data} /> },
      { title: 'Where it went', content: <CategoriesSlide transactions={recent.data} /> },
    ] : []),
  ]

  return (
    <>
      <PageHeader
        page="Home"
        headline={`${greeting}, ${user?.name.split(' ')[0] ?? 'there'}`}
        description={longDate(todayIso())}
      />

      {/* minmax(0, …) tracks: the carousel scrolls inside its column instead of widening the page. */}
      <div className="grid grid-cols-1 gap-5 md:gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="contents lg:grid lg:grid-cols-1 lg:content-start lg:gap-6">
          {showSetup && (
            <SetupSteps
              {...setup}
              budgets={budgets.data ?? []}
              onHide={() => {
                setSetupHidden(true)
                try { localStorage.setItem(SETUP_HIDDEN, '1') } catch { /* private mode */ }
              }}
            />
          )}
          <div className="order-1 grid grid-cols-1 gap-3 lg:order-none">
            {slides.length > 0 && (
              <Carousel
                key={String(noLeftSlide)} // starts again on "Left to spend" the moment setup finishes
                label="Your month so far"
                slides={slides}
              />
            )}
            {/* While setup shows, its steps lead (and its own Add expense step); the + button still adds. */}
            {!showSetup && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => openAdd({ kind: 'expense' })}><PenLine /> Add expense</Button>
                <Button variant="outline" onClick={() => openAdd({ kind: 'expense', scan: true })}><ScanLine /> Scan receipt</Button>
              </div>
            )}
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
              {recent.loading ? <LoadingItems rows={5} /> : recent.data?.length ? (
                <ItemGroup>{recent.data.slice(0, 6).map((t) => <TransactionItem key={t.id} t={t} />)}</ItemGroup>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing recorded yet. Your expenses and income show up here.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="contents lg:relative lg:grid lg:grid-cols-1 lg:content-start lg:gap-6">
          {/* The honeypot ant stands on the top edge of this column's first card, whichever that is, without adding height. */}
          <BrandMark mark="ant" className="pointer-events-none absolute right-6 bottom-full hidden w-16 lg:block" />
          {/* Only when a budget is near or over its limit: nothing to look at means no card at all
              (and no loading placeholder, so a card never flashes in and back out). */}
          {attention.length > 0 && (
            <Card className="order-2 lg:order-none">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>Needs attention</CardTitle>
                <CardDescription>Budgets near or over their limit</CardDescription>
                <CardAction>
                  <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/budgets" />}>All budgets</Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ItemGroup>
                  {attention.map((b) => <BudgetItem key={b.id} b={b} category={category(b.categoryId)} />)}
                </ItemGroup>
              </CardContent>
            </Card>
          )}

          {/* No wallets during setup: on phones the setup card's first step just said the same thing, so it waits. On wide
              screens it stays, beside the setup card, so the right column isn't left empty. */}
          <Card className={cn('order-4 lg:order-none', showSetup && !setup.hasWallet && 'max-lg:hidden')}>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Wallets</CardTitle>
              <CardDescription className="tabular-nums">{refLoading ? 'Loading balances' : `${money(total)} across ${activeWallets.length} ${activeWallets.length === 1 ? 'wallet' : 'wallets'}`}</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/settings?tab=wallets" />}>Manage</Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {refLoading ? <LoadingItems rows={3} /> : activeWallets.length ? (
                <ItemGroup>
                  {activeWallets.map((w) => <WalletItem key={w.id} w={w} />)}
                </ItemGroup>
              ) : (
                <p className="text-sm text-muted-foreground">No wallets yet. Add the cash, e-wallets and bank accounts you pay from.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

/** What's left to spend, plus budget used vs. month gone, so spending faster than the month is visible. */
function SafeToSpend({ s, budgets }: { s?: MonthSummary; budgets?: BudgetStatus[] }) {
  const { category } = useRefData()
  // With once-a-month categories, wait for the budgets too, so the pace doesn't change under the user's eyes.
  if (!s || (s.fixed.length && !budgets)) return <LoadingHero />

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

  const fixed = budgets && fixedPart(s.fixed, budgets)
  return <SafeToSpendCard s={s} fixed={fixed} note={fixed && leavesOut(s.fixed.map((f) => category(f.categoryId)?.name ?? 'Other'))} />
}

const SETUP_HIDDEN = 'anttipid-setup-hidden'

// Only first-run setup opens these, so Home doesn't wait on the Budgets and Settings files to render.
const BudgetForm = lazy(() => import('@/pages/budgets').then((m) => ({ default: m.BudgetForm })))
const WalletForm = lazy(() => import('@/components/wallet-form').then((m) => ({ default: m.WalletForm })))

/** First run: the three steps until Home can show what's left to spend each day. */
function SetupSteps({ hasWallet, hasBudget, hasExpense, budgets, onHide }: {
  hasWallet: boolean; hasBudget: boolean; hasExpense: boolean; budgets: BudgetStatus[]; onHide: () => void
}) {
  const { openAdd } = useApp()
  const [form, setForm] = useState<'wallet' | 'budget' | null>(null)

  const steps = [
    { done: hasWallet, title: 'Add a wallet', body: 'Cash, GCash or a bank account.', action: 'Add wallet', onClick: () => setForm('wallet') },
    { done: hasBudget, title: 'Set a monthly budget', body: 'One limit for this month.', action: 'Set budget', onClick: () => setForm('budget') },
    { done: hasExpense, title: 'Record an expense', body: 'Type it in or scan the receipt.', action: 'Add expense', onClick: () => openAdd({ kind: 'expense' }), blocked: !hasWallet },
  ]
  const next = steps.findIndex((s) => !s.done)

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Get set up</CardTitle>
        <CardDescription>{steps.filter((s) => s.done).length} of 3 done. Then Home shows how much you can spend each day.</CardDescription>
        <CardAction><Button variant="ghost" size="sm" onClick={onHide}>Hide</Button></CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {steps.map((s, i) => (
            <Item key={s.title} size="sm" role="listitem">
              <ItemMedia>
                <span className={cn('flex size-7 items-center justify-center rounded-full border text-sm font-medium tabular-nums', s.done && 'border-primary bg-primary text-primary-foreground')}>
                  {s.done ? <Check className="size-4" /> : i + 1}
                </span>
              </ItemMedia>
              <ItemContent>
                <ItemTitle className={cn(s.done && 'text-muted-foreground')}>{s.done && <span className="sr-only">Done: </span>}{s.title}</ItemTitle>
                {!s.done && <ItemDescription>{s.blocked ? 'Add a wallet first.' : s.body}</ItemDescription>}
              </ItemContent>
              {!s.done && (
                <ItemActions>
                  <Button size="sm" variant={i === next ? 'default' : 'outline'} disabled={s.blocked} onClick={s.onClick}>{s.action}</Button>
                </ItemActions>
              )}
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
      <Suspense fallback={null}>
        {form === 'wallet' && <WalletForm onClose={() => setForm(null)} />}
        {form === 'budget' && <BudgetForm editing={{ categoryId: null }} budgets={budgets} onClose={() => setForm(null)} />}
      </Suspense>
    </Card>
  )
}
