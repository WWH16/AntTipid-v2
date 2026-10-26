import { HeroCard } from '@/components/hero-card'
import { Badge } from '@/components/ui/badge'
import { CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { budgetPercent, everyday, type fixedPart, paceLine } from '@/lib/budget'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MonthSummary } from '@/types'

/**
 * What's left to spend, plus budget used vs. month gone, so spending faster than the month is visible. Needs s.budget > 0.
 * `fixed` is the once-a-month part (rent, tuition): the amounts and bars stay whole, the pace, badge and daily amount
 * run on everyday spending without it, and `note` says what was left out.
 */
export function SafeToSpendCard({ s, fixed, note }: {
  s: Pick<MonthSummary, 'budget' | 'spent' | 'daysInMonth' | 'dayOfMonth'> & { month?: string }
  fixed?: ReturnType<typeof fixedPart>
  note?: string | null
}) {
  const left = s.budget - s.spent
  const e = fixed ? everyday({ spent: s.spent, limit: s.budget }, fixed) : { spent: s.spent, limit: s.budget }
  const daysLeft = s.daysInMonth - s.dayOfMonth + 1 // today still counts
  const perDay = Math.max(0, e.limit - e.spent) / daysLeft
  const usedPct = budgetPercent({ spent: s.spent, limit: s.budget })
  const timePct = Math.round((s.dayOfMonth / s.daysInMonth) * 100)
  const gap = (e.limit * s.dayOfMonth) / s.daysInMonth - e.spent
  const over = left < 0
  // From day 5 on, the same pace line Budgets shows ("On track. You should reach month-end with ₱1,450 to
  // spare."). Before that, and on the landing page's sample card (no month), the plain on-budget pace instead.
  const line = s.month && !over ? paceLine(e, s.month) : null

  return (
    <HeroCard>
      <CardHeader>
        <CardDescription>{over ? 'Over your monthly budget by' : 'Left to spend this month'}</CardDescription>
        <CardTitle className={cn('text-3xl font-semibold tabular-nums', over && 'text-destructive-on-primary')}>
          {money(Math.abs(left), { whole: true })}
        </CardTitle>
        <CardAction>
          <Badge variant="secondary" className={cn(over && 'bg-destructive-on-primary! text-primary!')}>
            {over ? 'Over budget' : gap >= 0 ? 'On track' : 'Spending fast'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Progress value={usedPct} className={cn(over && '[&_[data-slot=progress-indicator]]:bg-destructive-on-primary!')}>
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
            : line ?? (gap >= 0
              ? `${money(gap, { whole: true })} below the on-budget pace. Up to ${money(perDay, { whole: true })} a day keeps you on budget.`
              : `${money(-gap, { whole: true })} above the on-budget pace. Keep to ${money(perDay, { whole: true })} a day to last the month.`)}
        </p>
        <p className="text-muted-foreground">
          {money(s.spent, { whole: true })} spent of {money(s.budget, { whole: true })}, {daysLeft === 1 ? 'last day of the month' : `${daysLeft} days left`}
        </p>
        {note && !over && <p className="text-muted-foreground">{note}</p>}
      </CardFooter>
    </HeroCard>
  )
}
