// Every transaction for a month, newest first, grouped by day. Filters sit above the list.
import { memo, useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, ReceiptText, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { useApp, useMonth, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { MonthSwitcher } from '@/components/month-switcher'
import { PageHeader } from '@/components/page-header'
import { SimpleSelect } from '@/components/simple-select'
import { EmptyState, ErrorState, LoadingItems } from '@/components/states'
import { TransactionItem } from '@/components/transaction-item'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { ItemGroup } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { dateInMonth, dayLabel, money, monthLabel } from '@/lib/format'
import { shouldHintSwipe, sumOf } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { Transaction, TransactionFilters, TransactionKind } from '@/types'

export function ActivityPage() {
  const [month, setMonth] = useMonth()
  const { openAdd } = useApp()
  const { wallets, categories } = useRefData()
  const [kind, setKind] = useState<'all' | TransactionKind>('all')
  const [walletId, setWalletId] = useState('all')
  // Category lives in the URL so Reports can link straight to one category's transactions.
  const [params, setParams] = useSearchParams()
  const categoryId = params.get('category') ?? 'all'
  const setCategoryId = (id: string) => setParams((p) => {
    if (id === 'all') p.delete('category')
    else p.set('category', id)
    return p
  }, { replace: true })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [moreFilters, setMoreFilters] = useState(false)
  // Decided once per visit, so the first row nudges once and a reload of the list doesn't nudge it again.
  const [hint] = useState(shouldHintSwipe)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(id)
  }, [search])

  // A search looks through every month: people search for "Meralco" to find it, not knowing when it was.
  const searching = !!debouncedSearch.trim()
  const filters: TransactionFilters = {
    month: searching ? undefined : month,
    kind: kind === 'all' ? undefined : kind,
    walletId: walletId === 'all' ? undefined : walletId,
    categoryId: categoryId === 'all' ? undefined : categoryId,
    search: debouncedSearch.trim() || undefined,
  }
  const { data: loaded, error, loading } = useQuery(`tx:${JSON.stringify(filters)}`, () => api.transactions.list(filters))
  // While a new search or filter loads, keep this month's last list on screen (dimmed) instead of flashing the skeleton.
  // A new month still shows the skeleton, so last month's rows never sit under this month's name.
  const [last, setLast] = useState<{ month: string; data: Transaction[] }>()
  if (loaded && loaded !== last?.data) setLast({ month, data: loaded })
  const data = loaded ?? (last?.month === month ? last.data : undefined)
  const stale = data !== loaded
  const filtered = kind !== 'all' || walletId !== 'all' || categoryId !== 'all' || !!search
  const clear = () => { setKind('all'); setWalletId('all'); setCategoryId('all'); setSearch(''); setDebouncedSearch('') }

  // A link to one day (#day-2026-08-14, from Reports) scrolls to it once the list is on screen.
  const { hash } = useLocation()
  const listShown = !!data?.length
  useEffect(() => {
    if (listShown && hash.startsWith('#day-')) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash, listShown])

  // Nothing this month and no filter on: totals, export and the filters have nothing to work on, and the empty state
  // below already says the month is empty. Search stays: it looks through every month.
  const empty = data?.length === 0 && !filtered

  return (
    <>
      <PageHeader
        page="Activity"
        // The month is in the switcher right below, so the headline doesn't repeat it.
        headline={!data || empty ? 'Activity' : `${data.length} ${filtered ? (data.length === 1 ? 'match' : 'matches') : (data.length === 1 ? 'transaction' : 'transactions')}${searching ? ' in all months' : ''}`}
        // Totals sit under the headline, not in the sticky bar: on phones they'd wrap to a second pinned row.
        description={empty ? undefined : (
          <span className="flex flex-wrap gap-x-4 tabular-nums">
            <span>Spent <span className="font-semibold text-foreground">{money(sumOf(data, 'expense'))}</span></span>
            <span>Earned <span className="font-semibold text-foreground">{money(sumOf(data, 'income'))}</span></span>
          </span>
        )}
        action={!empty && (
          <Button onClick={() => exportCsv(filters)} disabled={!data?.length}>
            <Download /> <span className="sr-only sm:not-sr-only">Export CSV</span>
          </Button>
        )}
      />

      <MonthSwitcher month={month} onChange={setMonth} />

      {/* Wide screens: list on the left at a readable width, filters in a column on the right that stays in view.
          Narrower: filters stacked above the list. */}
      <div className="grid gap-5 md:gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">

      <div className="grid gap-4 lg:sticky lg:top-20 lg:order-2">

        <div className="flex gap-2">
          <InputGroup>
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search all months"
              aria-label="Search transactions"
              value={search}
              onChange={(e) => {
                const v = e.target.value
                setSearch(v)
                if (!v.trim()) setDebouncedSearch('')
              }}
            />
          </InputGroup>
          <Button
            variant={walletId !== 'all' || categoryId !== 'all' ? 'secondary' : 'outline'}
            size="icon"
            className={cn('md:hidden', empty && 'hidden')}
            aria-expanded={moreFilters}
            aria-controls="more-filters"
            aria-label="Filter by wallet and category"
            onClick={() => setMoreFilters((v) => !v)}
          >
            <SlidersHorizontal />
          </Button>
        </div>

        <div className={cn('flex flex-col gap-2 md:flex-row md:items-center lg:flex-col lg:items-stretch', empty && 'hidden')}>
          <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <TabsList className="w-full md:w-auto lg:w-full">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="expense">Expenses</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="transfer">Transfers</TabsTrigger>
            </TabsList>
          </Tabs>
          <div id="more-filters" className={cn('flex-1 grid-cols-2 gap-2 md:grid md:max-w-md lg:max-w-none lg:grid-cols-1', moreFilters ? 'grid' : 'hidden')}>
            <SimpleSelect aria-label="Wallet" value={walletId} onChange={setWalletId} options={[{ value: 'all', label: 'All wallets' }, ...wallets.map((w) => ({ value: w.id, label: w.name }))]} />
            <SimpleSelect aria-label="Category" value={categoryId} onChange={setCategoryId} options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
          {filtered && <Button variant="ghost" onClick={clear} className="self-start md:self-auto lg:self-start"><X /> Clear filters</Button>}
        </div>
      </div>

      <div className="min-w-0 lg:order-1">
      {error ? <ErrorState error={error} /> : loading && !data ? <LoadingDays /> : !data?.length ? (
        filtered
          ? <EmptyState framed icon={SearchX} title="No matches" body={searching ? 'Nothing in any month matches these filters.' : `Nothing in ${monthLabel(month)} matches these filters.`} action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
          : <EmptyState framed icon={ReceiptText} title={`Nothing recorded in ${monthLabel(month)}`} body="Transactions you add for this month are listed here." action={<Button onClick={() => openAdd({ date: dateInMonth(month) })}>Add transaction</Button>} />
      ) : (
        <Card aria-busy={stale} className={cn('transition-opacity', stale && 'opacity-60')}>
          <DayList list={data} hint={hint} />
        </Card>
      )}
      </div>
      </div>
    </>
  )
}

const DayList = memo(function DayList({ list, hint }: { list: Transaction[]; hint: boolean }) {
  return (
    <CardContent className="grid gap-2 md:gap-4">
      {[...Map.groupBy(list, (t) => t.date)].map(([day, items], i) => {
        const spent = sumOf(items, 'expense')
        return (
          <section key={day} id={`day-${day}`} className="grid scroll-mt-16 gap-1">
            {i > 0 && <Separator className="mb-2 md:mb-3" />}
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <h2 className="font-medium">{dayLabel(day)}</h2>
              {spent > 0 && <span className="text-muted-foreground tabular-nums">{money(spent)} spent</span>}
            </div>
            <ItemGroup>{items.map((t, j) => <TransactionItem key={t.id} t={t} swipe hint={hint && i === 0 && j === 0} />)}</ItemGroup>
          </section>
        )
      })}
    </CardContent>
  )
})

/** Two day groups, like the loaded list. */
function LoadingDays() {
  return (
    <Card aria-busy>
      <CardContent className="grid gap-2 md:gap-4">
        {[3, 2].map((rows, i) => (
          <div key={rows} className="grid gap-1">
            {i > 0 && <Separator className="mb-2 md:mb-3" />}
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
            <LoadingItems rows={rows} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function exportCsv(filters: TransactionFilters) {
  api.transactions.exportCsv(filters).catch((e: Error) => toast.error("Couldn't export the CSV", { description: e.message }))
}
