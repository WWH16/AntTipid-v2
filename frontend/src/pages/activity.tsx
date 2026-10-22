// Every transaction for a month, newest first, grouped by day. Filters sit above the list.
import { useEffect, useState } from 'react'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { dateInMonth, dayLabel, money, monthLabel } from '@/lib/format'
import { sumOf } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type { Transaction, TransactionFilters, TransactionKind } from '@/types'

export function ActivityPage() {
  const [month, setMonth] = useMonth()
  const { openAdd } = useApp()
  const { wallets, categories } = useRefData()
  const [kind, setKind] = useState<'all' | TransactionKind>('all')
  const [walletId, setWalletId] = useState('all')
  const [categoryId, setCategoryId] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [moreFilters, setMoreFilters] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(id)
  }, [search])

  const filters: TransactionFilters = {
    month,
    kind: kind === 'all' ? undefined : kind,
    walletId: walletId === 'all' ? undefined : walletId,
    categoryId: categoryId === 'all' ? undefined : categoryId,
    search: debouncedSearch.trim() || undefined,
  }
  const { data, error, loading } = useQuery(`tx:${JSON.stringify(filters)}`, () => api.transactions.list(filters))
  const filtered = kind !== 'all' || walletId !== 'all' || categoryId !== 'all' || !!search
  const clear = () => { setKind('all'); setWalletId('all'); setCategoryId('all'); setSearch(''); setDebouncedSearch('') }

  return (
    <>
      <PageHeader
        page="Activity"
        headline={!data ? monthLabel(month) : `${data.length} ${filtered ? (data.length === 1 ? 'match' : 'matches') : (data.length === 1 ? 'transaction' : 'transactions')} in ${monthLabel(month)}`}
        description={isMobile ? 'Tap a row for details, or swipe it left to edit or delete.' : 'Select a row to see its details.'}
        action={
          <Button variant="outline" onClick={() => exportCsv(filters)} disabled={!data?.length}>
            <Download /> <span className="sr-only sm:not-sr-only">Export CSV</span>
          </Button>
        }
      />

      <MonthSwitcher month={month} onChange={setMonth}>
        <p className="text-sm text-muted-foreground">
          Spent <span className="font-medium text-foreground tabular-nums">{money(sumOf(data, 'expense'))}</span>
          {', earned '}
          <span className="font-medium text-foreground tabular-nums">{money(sumOf(data, 'income'))}</span>
        </p>
      </MonthSwitcher>

      <div className="grid gap-4">

        <div className="flex gap-2">
          <InputGroup>
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search by description or note"
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
            className="md:hidden"
            aria-expanded={moreFilters}
            aria-controls="more-filters"
            aria-label="Filter by wallet and category"
            onClick={() => setMoreFilters((v) => !v)}
          >
            <SlidersHorizontal />
          </Button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <TabsList className="w-full md:w-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="expense">Expenses</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="transfer">Transfers</TabsTrigger>
            </TabsList>
          </Tabs>
          <div id="more-filters" className={cn('flex-1 grid-cols-2 gap-2 md:grid md:max-w-md', moreFilters ? 'grid' : 'hidden')}>
            <SimpleSelect aria-label="Wallet" value={walletId} onChange={setWalletId} options={[{ value: 'all', label: 'All wallets' }, ...wallets.map((w) => ({ value: w.id, label: w.name }))]} />
            <SimpleSelect aria-label="Category" value={categoryId} onChange={setCategoryId} options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
          {filtered && <Button variant="ghost" onClick={clear} className="self-start md:self-auto"><X /> Clear filters</Button>}
        </div>
      </div>

      {error ? <ErrorState error={error} /> : loading && !data ? <LoadingDays /> : !data?.length ? (
        filtered
          ? <EmptyState framed icon={SearchX} title="No matches" body={`Nothing in ${monthLabel(month)} matches these filters.`} action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
          : <EmptyState framed icon={ReceiptText} title={`Nothing recorded in ${monthLabel(month)}`} body="Transactions you add for this month are listed here." action={<Button onClick={() => openAdd({ date: dateInMonth(month) })}>Add transaction</Button>} />
      ) : (
        <Card>
          <CardContent className="grid gap-2 md:gap-4">
            {groupByDay(data).map(([day, items], i) => {
              const spent = sumOf(items, 'expense')
              return (
                <section key={day} className="grid gap-1">
                  {i > 0 && <Separator className="mb-2 md:mb-3" />}
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <h2 className="font-medium">{dayLabel(day)}</h2>
                    {spent > 0 && <span className="text-muted-foreground tabular-nums">{money(spent)} spent</span>}
                  </div>
                  <ItemGroup>{items.map((t) => <TransactionItem key={t.id} t={t} />)}</ItemGroup>
                </section>
              )
            })}
          </CardContent>
        </Card>
      )}
    </>
  )
}

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

function groupByDay(list: Transaction[]) {
  const groups = new Map<string, Transaction[]>()
  for (const t of list) groups.set(t.date, [...(groups.get(t.date) ?? []), t])
  return [...groups]
}

function exportCsv(filters: TransactionFilters) {
  api.transactions.exportCsv(filters).catch((e: Error) => toast.error("Couldn't export the CSV", { description: e.message }))
}
