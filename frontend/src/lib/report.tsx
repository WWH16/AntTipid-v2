/** Earned, spent and saved (or overspent) for a month, with the tone each figure uses. */
export function monthTotals(income: number, spent: number) {
  const saved = income - spent
  return [
    ['Earned', income, 'text-chart-1'],
    ['Spent', spent, 'text-chart-2'],
    [saved >= 0 ? 'Saved' : 'Overspent', Math.abs(saved), saved >= 0 ? 'text-primary' : 'text-destructive'],
  ] as const
}
