// A paper copy of one month: totals, spending by category, the 6-month trend and every transaction. Opens outside the
// app shell, always on white, so the preview matches what prints (and what "Save as PDF" writes).
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { monthLink, useApp, useRefData } from '@/app-state'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { endLine, monthBudgets } from '@/lib/budget'
import { currentMonth, longDate, money, monthLabel, todayIso } from '@/lib/format'
import { categoryRows, printDate, printMonth, signedAmount } from '@/lib/print-report'
import { monthTotals } from '@/lib/report'

const th = 'border-b border-neutral-300 py-1.5 font-semibold'
const td = 'break-inside-avoid border-b border-neutral-300 py-1.5 align-top [overflow-wrap:anywhere]'
const num = 'pl-2 text-right tabular-nums'

export function PrintReportPage() {
  const [params] = useSearchParams()
  const month = printMonth(params.get('month'), currentMonth())
  const { user } = useApp()
  const report = useQuery(`report:${month}`, () => api.reports.monthly(month))
  const transactions = useQuery(`tx:${JSON.stringify({ month })}`, () => api.transactions.list({ month }))
  const { category, wallet, settled: refSettled, error: refError } = useRefData()
  useEffect(() => { document.title = `AntTipid report ${month}` }, [month])

  const error = report.error ?? transactions.error ?? refError
  const data = report.data
  const txs = transactions.data
  // Settled, not just loaded: cached data from an earlier visit shows at once but may be stale, and must not print.
  const ready = !!data && !!txs && report.settled && transactions.settled && refSettled && !error

  const rows = data ? categoryRows(data, (id) => category(id)?.name ?? 'Other') : []
  const thisMonth = data?.trend.at(-1)
  const spentTotal = data?.byCategory.reduce((s, c) => s + c.total, 0) ?? 0
  // Same rule as Reports: only a finished month with spending, and only when it has a monthly budget.
  const monthly = month < currentMonth() && spentTotal > 0 ? monthBudgets(data!).find((b) => b.categoryId === null) : undefined

  return (
    <div className="min-h-svh bg-neutral-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link to={monthLink('/reports', month)} />}>Back to reports</Button>
        <Button size="sm" disabled={!ready} onClick={() => window.print()}>Print</Button>
      </div>
      {error && <div className="mx-auto mb-4 max-w-[210mm] print:hidden"><ErrorState error={error} /></div>}

      {ready && (
        <article className="mx-auto max-w-[210mm] bg-white p-6 text-sm text-black shadow sm:p-10 print:max-w-none print:p-0 print:shadow-none">
          <header className="border-b border-neutral-300 pb-4">
            <p className="text-lg font-bold">AntTipid</p>
            <h1 className="text-2xl font-semibold">Monthly report</h1>
            <p className="text-lg">{monthLabel(month)}</p>
            <p className="mt-2 break-words">Prepared for {user?.name} ({user?.email})</p>
            <p>Printed {longDate(todayIso())}</p>
          </header>

          <section className="mt-6">
            <dl className="grid grid-cols-3 gap-2">
              {monthTotals(thisMonth?.income ?? 0, thisMonth?.spent ?? 0).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className="text-base font-semibold tabular-nums sm:text-xl">{money(value)}</dd>
                </div>
              ))}
            </dl>
            {monthly && <p className="mt-3 tabular-nums">{endLine(monthly)}</p>}
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-base font-semibold">Spending by category</h2>
            {rows.length ? (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr><th className={th}>Category</th><th className={`${th} ${num}`}>Spent</th><th className={`${th} ${num} max-sm:hidden print:table-cell`}>Share</th><th className={`${th} ${num}`}>Budget</th><th className={`${th} ${num}`}>Left</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className={td}>{r.name}</td>
                      <td className={`${td} ${num}`}>{money(r.spent)}</td>
                      <td className={`${td} ${num} max-sm:hidden print:table-cell`}>{r.share}%</td>
                      <td className={`${td} ${num}`}>{r.limit === null ? '—' : money(r.limit)}</td>
                      <td className={`${td} ${num}`}>{r.left === null ? '—' : money(r.left)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No spending recorded in {monthLabel(month)}.</p>
            )}
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-base font-semibold">Income and spending, last 6 months</h2>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr><th className={th}>Month</th><th className={`${th} ${num}`}>Income</th><th className={`${th} ${num}`}>Spending</th></tr>
              </thead>
              <tbody>
                {data.trend.map((m) => (
                  <tr key={m.month}>
                    <td className={td}>{monthLabel(m.month)}</td>
                    <td className={`${td} ${num}`}>{money(m.income)}</td>
                    <td className={`${td} ${num}`}>{money(m.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-base font-semibold">Transactions</h2>
            {txs.length ? (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th className={th}>Date</th><th className={th}>Description</th><th className={th}>Category</th>
                    <th className={`${th} max-sm:hidden print:table-cell`}>Wallet</th><th className={`${th} ${num}`}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id}>
                      <td className={`${td} whitespace-nowrap pr-2`}>{printDate(t.date)}</td>
                      <td className={`${td} pr-2`}>{t.title}</td>
                      <td className={`${td} pr-2`}>{t.categoryId ? (category(t.categoryId)?.name ?? 'Other') : '—'}</td>
                      <td className={`${td} pr-2 max-sm:hidden print:table-cell`}>{wallet(t.walletId)?.name ?? '—'}{t.kind === 'transfer' && ` to ${wallet(t.toWalletId)?.name ?? 'wallet'}`}</td>
                      <td className={`${td} ${num} whitespace-nowrap`}>{signedAmount(t.kind, t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No transactions recorded in {monthLabel(month)}.</p>
            )}
          </section>
        </article>
      )}
    </div>
  )
}
