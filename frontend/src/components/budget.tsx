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
  // Usage against the limit. "On track" / "Spending fast" belong to the pace line under the bar, not the badge.
  ok: { label: 'Under limit', variant: 'secondary' },
  near: { label: 'Near limit', variant: 'outline' },
  used: { label: 'Used up', variant: 'outline' },
  over: { label: 'Over budget', variant: 'destructive' },
} as const

export function BudgetBadge({ state, solid }: { state: BudgetState; solid?: boolean }) {
  return (
    <Badge variant={solid ? 'secondary' : BADGE[state].variant} className="inline-flex items-center gap-1">
      {state === 'ok' && <BrandMark mark="coin" className="size-4 shrink-0" />}
      {BADGE[state].label}
    </Badge>
  )
}

/** One category budget: name, what's left, status, a progress bar and the pace line. Clickable when onSelect is given. */
export function BudgetItem({ b, category, onSelect, pace }: { b: BudgetStatus; category?: Category; onSelect?: () => void; pace?: string | null }) {
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
      <ItemFooter className="flex-col items-stretch gap-2">
        <Progress value={budgetPercent(b)} className={cn('w-full', OVER_BAR[budgetState(b)])} aria-label={`${category?.name} budget used`} />
        {pace && <p className="text-sm text-muted-foreground">{pace}</p>}
      </ItemFooter>
    </Item>
  )
}
