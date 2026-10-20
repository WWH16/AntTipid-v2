// Monthly spending limits. The whole-month budget leads; category budgets follow, worst first.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useMonth, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { BudgetBadge, BudgetItem } from '@/components/budget'
import { BusyButton } from '@/components/busy-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { OVER_BAR, budgetPercent, budgetRemaining, budgetState } from '@/lib/budget'
import { MoneyInput } from '@/components/money-input'
import { MonthSwitcher } from '@/components/month-switcher'
import { PageHeader } from '@/components/page-header'
import { ResponsivePanel } from '@/components/responsive-panel'
import { SimpleSelect } from '@/components/simple-select'
import { HeroCard } from '@/components/hero-card'
import { EmptyState, ErrorState, LoadingCard, LoadingHero, LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ItemGroup } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useAction } from '@/hooks/use-action'
import { done } from '@/lib/done'
import { money, monthLabel } from '@/lib/format'
import type { BudgetStatus } from '@/types'

type Editing = { budget?: BudgetStatus; categoryId?: string | null } | null
const SEVERITY = { over: 0, near: 1, ok: 2 }

export function BudgetsPage() {
  const [month, setMonth] = useMonth()
  const { categories, category } = useRefData()
  const { data, error, loading } = useQuery(`budgets:${month}`, () => api.budgets.list(month))
  const [editing, setEditing] = useState<Editing>(null)

  const overall = data?.find((b) => b.categoryId === null)
  const byCategory = (data ?? [])
    .filter((b) => b.categoryId !== null)
    .sort((a, b) => SEVERITY[budgetState(a)] - SEVERITY[budgetState(b)] || b.spent / b.limit - a.spent / a.limit)
  const needing = byCategory.filter((b) => budgetState(b) !== 'ok').map((b) => category(b.categoryId)?.name ?? 'Other')
  const unbudgeted = categories.filter((c) => c.kind === 'expense' && !data?.some((b) => b.categoryId === c.id))

  return (
    <>
      <PageHeader
        page="Budgets"
        headline={!data ? 'Budgets' : !data.length ? 'No budgets yet' : needing.length ? `${needing.length} ${needing.length === 1 ? 'budget needs' : 'budgets need'} a look` : 'Every budget is on track'}
        description={needing.length
          ? `${new Intl.ListFormat('en').format(needing)} ${needing.length === 1 ? 'is' : 'are'} near or over the limit in ${monthLabel(month)}.`
          : data?.length ? `Nothing near its limit in ${monthLabel(month)}.` : 'Set a limit for the month or for one category.'}
        action={<Button onClick={() => setEditing({})}><Plus /> New budget</Button>}
      />
      <MonthSwitcher month={month} onChange={setMonth} />

      {error ? <ErrorState error={error} /> : loading && !data ? (
        <div className="grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
          <LoadingHero compact />
          <LoadingCard><LoadingItems rows={3} progress /></LoadingCard>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
          {overall ? (
            <HeroCard>
              <CardHeader>
                <CardDescription>Whole month, all spending</CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums">{budgetRemaining(overall)}</CardTitle>
                <CardAction><BudgetBadge state={budgetState(overall)} solid /></CardAction>
              </CardHeader>
              <CardContent>
                <Progress value={budgetPercent(overall)} className={OVER_BAR[budgetState(overall)]} aria-label="Budget used" />
              </CardContent>
              <CardFooter className="justify-between gap-2 text-sm">
                <span className="text-muted-foreground tabular-nums">{money(overall.spent, { whole: true })} of {money(overall.limit, { whole: true })}</span>
                <Button variant="secondary" size="sm" onClick={() => setEditing({ budget: overall })}>Edit</Button>
              </CardFooter>
            </HeroCard>
          ) : (
            <EmptyState title="No monthly budget" body="One limit for all your spending. Home uses it to show what's safe to spend." action={<Button onClick={() => setEditing({ categoryId: null })}>Set monthly budget</Button>} />
          )}

          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>By category</CardTitle>
              <CardDescription>Over and near-limit budgets first. Select one to change it.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {byCategory.length ? (
                <ItemGroup>
                  {byCategory.map((b) => <BudgetItem key={b.id} b={b} category={category(b.categoryId)} onSelect={() => setEditing({ budget: b })} />)}
                </ItemGroup>
              ) : (
                <EmptyState title="No category budgets" body="Limit what goes to food, transport or anything else." action={<Button variant="outline" onClick={() => setEditing({})}>Add a category budget</Button>} />
              )}
              {unbudgeted.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-sm text-muted-foreground">No budget yet</p>
                  <div className="flex flex-wrap gap-2">
                    {unbudgeted.map((c) => (
                      <Button key={c.id} variant="outline" size="sm" onClick={() => setEditing({ categoryId: c.id })}>
                        <Plus /> {c.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {editing && <BudgetForm key={editing.budget?.id ?? String(editing.categoryId)} editing={editing} onClose={() => setEditing(null)} budgets={data ?? []} />}
    </>
  )
}

function BudgetForm({ editing, onClose, budgets }: { editing: NonNullable<Editing>; onClose: () => void; budgets: BudgetStatus[] }) {
  const { categories, category } = useRefData()
  const b = editing.budget
  const [target, setTarget] = useState(b ? (b.categoryId ?? 'all') : editing.categoryId === null ? 'all' : (editing.categoryId ?? ''))
  const [limit, setLimit] = useState(b ? String(b.limit) : '')
  const [warnAt, setWarnAt] = useState(String(b?.warnAt ?? 80))
  const taken = new Set(budgets.map((x) => x.categoryId ?? 'all'))
  const options = [
    { value: 'all', label: 'Whole month (all spending)' },
    ...categories.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.name })),
  ].filter((o) => o.value === target || !taken.has(o.value))

  const name = target === 'all' ? 'Monthly budget' : `${category(target)?.name ?? ''} budget`
  const valid = target && Number(limit) > 0

  const [run, busy] = useAction()
  const [confirming, setConfirming] = useState(false)

  const save = () => run(async () => {
    await api.budgets.save({ id: b?.id, categoryId: target === 'all' ? null : target, limit: Number(limit), warnAt: Number(warnAt) })
    onClose()
    done(b ? 'Changes saved' : 'Budget added', { description: `${name}: ${money(Number(limit), { whole: true })} a month` })
  })

  const remove = async () => {
    await api.budgets.remove(b!.id)
    onClose()
    done('Budget removed', { description: name })
  }

  return (
    <ResponsivePanel
      onClose={onClose}
      title={b ? `Edit ${name.toLowerCase()}` : 'New budget'}
      description="The limit repeats every month. You'll see a warning once spending passes the warning point."
      footer={
        <>
          <BusyButton type="submit" form="budget-form" busy={busy} disabled={!valid}>{b ? 'Save changes' : 'Add budget'}</BusyButton>
          {b && <Button variant="destructive" onClick={() => setConfirming(true)}>Remove budget</Button>}
        </>
      }
    >
      <form id="budget-form" onSubmit={(e) => { e.preventDefault(); if (valid) save() }} className="grid gap-4 pb-4">
        {!b && (
          <div className="grid gap-2">
            <Label htmlFor="budget-for">Budget for</Label>
            <SimpleSelect id="budget-for" value={target} onChange={setTarget} options={options} placeholder="Choose a category" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="limit">Monthly limit</Label>
            <MoneyInput id="limit" autoFocus placeholder="5000" value={limit} onChange={setLimit} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="warn">Warn me at</Label>
            <SimpleSelect id="warn" value={warnAt} onChange={setWarnAt} options={[70, 75, 80, 90].map((p) => ({ value: String(p), label: `${p}% used` }))} />
          </div>
        </div>
      </form>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove the ${name.toLowerCase()}?`}
        description="Your spending stays. Only the limit and its warnings go away."
        confirm="Remove budget"
        onConfirm={remove}
      />
    </ResponsivePanel>
  )
}
