import { CategoryMedia } from '@/components/category-icon'
import { Badge } from '@/components/ui/badge'
import { BrandMark } from '@/components/brand-icons'
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemTitle } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { OVER_BAR, budgetPercent, budgetRemaining, budgetState, type BudgetState } from '@/lib/budget'
import { cn } from '@/lib/utils'
import { money } from '@/lib/format'
import type { BudgetStatus, Category } from '@/types'

const BADGE = {
  ok: { label: 'On track', variant: 'secondary' },
  near: { label: 'Near limit', variant: 'outline' },
  over: { label: 'Over budget', variant: 'destructive' },
} as const

export function BudgetBadge({ state, solid }: { state: BudgetState; solid?: boolean }) {
  return (
    <Badge variant={solid ? 'secondary' : BADGE[state].variant} className="inline-flex items-center gap-1">
      {state === 'ok' && <BrandMark mark="carrier" className="size-3.5 shrink-0" />}
      {BADGE[state].label}
    </Badge>
  )
}

/** One category budget: name, what's left, status and a progress bar. Clickable when onSelect is given. */
export function BudgetItem({ b, category, onSelect }: { b: BudgetStatus; category?: Category; onSelect?: () => void }) {
  return (
    <Item
      render={onSelect ? <button type="button" onClick={onSelect} /> : undefined}
      className={onSelect ? 'text-left hover:bg-muted' : undefined}
    >
      <CategoryMedia category={category} />
      <ItemContent>
        <ItemTitle>{category?.name}</ItemTitle>
        <ItemDescription className="tabular-nums">{budgetRemaining(b)} of {money(b.limit, { whole: true })}</ItemDescription>
      </ItemContent>
      <ItemActions><BudgetBadge state={budgetState(b)} /></ItemActions>
      <ItemFooter><Progress value={budgetPercent(b)} className={cn('w-full', OVER_BAR[budgetState(b)])} aria-label={`${category?.name} budget used`} /></ItemFooter>
    </Item>
  )
}
