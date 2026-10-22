// Home answers one question first: how much can I still spend this month? Then what needs attention, then details.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, PenLine, ScanLine, Settings } from 'lucide-react'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { BudgetItem } from '@/components/budget'
import { budgetState } from '@/lib/budget'
import { PageHeader } from '@/components/page-header'
import { SafeToSpendCard } from '@/components/safe-to-spend-card'
import { BrandMark } from '@/components/brand-icons'
import { BillsSlide, Carousel, SpendingSlide } from '@/components/home-carousel'
import { ErrorState, LoadingHero, LoadingItems } from '@/components/states'
import { TransactionItem } from '@/components/transaction-item'
import { WalletItem } from '@/components/wallet-item'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { currentMonth, longDate, money, todayIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BudgetForm } from '@/pages/budgets'
import { WalletForm } from '@/pages/settings'
import type { BudgetStatus, MonthSummary } from '@/types'

export function HomePage() {
  const month = currentMonth()
  const { openAdd, user } = useApp()
  const summary = useQuery(`summary:${month}`, () => api.reports.summary(month))
  const budgets = useQuery(`budgets:${month}`, () => api.budgets.list(month))
  const recent = useQuery('recent', () => api.transactions.list({}))
  const { wallets, category, loading: refLoading } = useRefData()

  const attention = (budgets.data ?? []).filter((b) => b.categoryId && budgetState(b) !== 'ok')
  const activeWallets = wallets.filter((w) => !w.archived)
  const total = activeWallets.reduce((s, w) => s + w.balance, 0)

  const [hour] = useState(() => new Date().getHours())
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const [setupHidden, setSetupHidden] = useState(() => { try { return localStorage.getItem(SETUP_HIDDEN) === '1' } catch { return false } })
  const setup = !refLoading && summary.data && recent.data && !setupHidden
    ? { hasWallet: activeWallets.length > 0, hasBudget: summary.data.budget > 0, hasExpense: recent.data.some((t) => t.kind === 'expense') }
    : null
  const showSetup = setup && !(setup.hasWallet && setup.hasBudget && setup.hasExpense)
  // While setup is showing, its budget step stands in for the "Set a monthly budget" slide.
  const noLeftSlide = !!showSetup && !setup.hasBudget

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
            <Carousel
              key={String(noLeftSlide)} // starts again on "Left to spend" the moment setup finishes
              label="Your month so far"
              slides={[
                ...(noLeftSlide ? [] : [{ title: 'Left to spend', content: summary.error ? <ErrorState error={summary.error} /> : <SafeToSpend s={summary.data} /> }]),
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
              {recent.loading ? <LoadingItems rows={5} /> : recent.data?.length ? (
                <ItemGroup>{recent.data.slice(0, 6).map((t) => <TransactionItem key={t.id} t={t} />)}</ItemGroup>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing recorded yet. Your expenses and income show up here.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="contents lg:grid lg:grid-cols-1 lg:content-start lg:gap-6">
          {/* The honeypot ant stands on the card edge, keeping watch on budgets without adding height. */}
          <div className="relative order-2 lg:order-none">
          <BrandMark mark="ant" className="pointer-events-none absolute right-6 bottom-full hidden w-16 lg:block" />
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Needs attention</CardTitle>
              <CardDescription>Budgets near or over their limit</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/budgets" />}>All budgets</Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {budgets.loading ? <LoadingItems rows={2} progress /> : attention.length ? (
                <ItemGroup>
                  {attention.map((b) => <BudgetItem key={b.id} b={b} category={category(b.categoryId)} />)}
                </ItemGroup>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {(budgets.data ?? []).some((b) => b.categoryId)
                    ? 'All budgets are on track.'
                    : 'No category budgets yet. Give a category a limit and it shows up here when spending gets close.'}
                </p>
              )}
            </CardContent>
          </Card>
          </div>

          <Card className="order-4 lg:order-none">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>Wallets</CardTitle>
              <CardDescription className="tabular-nums">{refLoading ? 'Loading balances' : `${money(total)} across ${activeWallets.length} ${activeWallets.length === 1 ? 'wallet' : 'wallets'}`}</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/settings" />}>Manage</Button>
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
function SafeToSpend({ s }: { s?: MonthSummary }) {
  if (!s) return <LoadingHero />

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

  return <SafeToSpendCard s={s} />
}

const SETUP_HIDDEN = 'anttipid-setup-hidden'

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
      {form === 'wallet' && <WalletForm onClose={() => setForm(null)} />}
      {form === 'budget' && <BudgetForm editing={{ categoryId: null }} budgets={budgets} onClose={() => setForm(null)} />}
    </Card>
  )
}
