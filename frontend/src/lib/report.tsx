/** Earned, spent and saved (or short by, not "overspent": this isn't the budget) for a month, with the tone each figure uses. */
export function monthTotals(income: number, spent: number) {
  const saved = income - spent
  return [
    ['Earned', income, 'text-chart-1-text'],
    ['Spent', spent, 'text-chart-2'],
    [saved >= 0 ? 'Saved' : 'Short by', Math.abs(saved), saved >= 0 ? 'text-primary' : 'text-destructive'],
  ] as const
}
