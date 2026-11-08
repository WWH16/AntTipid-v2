import { useState } from 'react'
import { DatabaseBackup, LogIn, Pencil, Plus, ScrollText, Trash2 } from 'lucide-react'
import { api } from '@/api/endpoints'
import { refresh, useQuery } from '@/api/use-query'
import { BusyButton } from '@/components/busy-button'
import { SectionHeader } from '@/components/section-header'
import { SimpleSelect } from '@/components/simple-select'
import { EmptyState, ErrorState, LoadingItems } from '@/components/states'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'
import { useAction } from '@/hooks/use-action'
import { auditDay, auditLine, auditTime } from '@/lib/audit'
import { dayLabel } from '@/lib/format'
import { cn, groupBy } from '@/lib/utils'
import type { AuditEntry } from '@/types'

const PAGE = 50
const MAX = 1000

const ICONS = { create: Plus, update: Pencil, delete: Trash2, sign_in: LogIn, restore: DatabaseBackup }

const FILTERS = [
  { value: 'all', label: 'All entries' },
  { value: 'transaction', label: 'Transactions' },
  { value: 'wallet', label: 'Wallets' },
  { value: 'category', label: 'Categories' },
  { value: 'budget', label: 'Budgets' },
  { value: 'account', label: 'Sign-ins and restores' },
]

function AuditRow({ e }: { e: AuditEntry }) {
  const { title, details } = auditLine(e)
  const Icon = ICONS[e.action]
  return (
    <Item size="sm" role="listitem">
      <ItemMedia variant="icon"><Icon /></ItemMedia>
      <ItemContent>
        <ItemTitle className="line-clamp-none break-words">{title}</ItemTitle>
        {details.map((d) => <ItemDescription key={d} className="line-clamp-none break-words">{d}</ItemDescription>)}
      </ItemContent>
      <ItemActions className="self-start">
        <time dateTime={e.createdAt} className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{auditTime(e.createdAt)}</time>
      </ItemActions>
    </Item>
  )
}

export function AuditLogSection() {
  const [entity, setEntity] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  const filtered = entity !== 'all'
  const { data: loaded, error, loading } = useQuery(`audit:${entity}:${limit}`, () => api.audit.list(limit, filtered ? entity : undefined))
  // Keep the last loaded list on screen, dimmed, while another loads, so "Load more" or a filter doesn't flash the
  // skeleton, and a failed "Load more" doesn't take away what's already here.
  const [last, setLast] = useState<AuditEntry[]>()
  if (loaded && loaded !== last) setLast(loaded)
  const data = loaded ?? last
  const dimmed = data !== loaded && !error
  const [retry, retrying] = useAction()
  const loadingMore = !loaded && !error && limit > PAGE

  return (
    <section>
      <SectionHeader title="Audit log" description="Each sign-in and each change to your wallets, categories, transactions and budgets. You can’t edit or delete these entries." />
      <SimpleSelect
        aria-label="Show entries for"
        className="mb-3 w-full sm:w-56"
        value={entity}
        onChange={(v) => { setEntity(v); setLimit(PAGE) }}
        options={FILTERS}
      />
      {loading && !data ? <LoadingItems rows={5} amount={false} /> : data && !data.length ? (
        <EmptyState icon={ScrollText} title="Nothing logged yet" body={filtered ? 'Nothing here for this filter.' : 'Your sign-ins and changes show up here.'} />
      ) : data && (
        <div aria-busy={dimmed} className={cn('grid gap-2 motion-safe:transition-opacity md:gap-4', dimmed && 'opacity-60')}>
          {[...groupBy(data, (e) => auditDay(e.createdAt))].map(([day, rows], i) => (
            <section key={day} className="grid gap-1">
              {i > 0 && <Separator className="mb-2 md:mb-3" />}
              <h3 className="text-sm font-medium">{dayLabel(day)}</h3>
              <ItemGroup className="-mx-3">{rows.map((e) => <AuditRow key={e.id} e={e} />)}</ItemGroup>
            </section>
          ))}
        </div>
      )}
      {error && (
        <div className="mt-3 grid gap-3">
          <ErrorState error={error} />
          <BusyButton variant="outline" className="justify-self-start" busy={retrying} onClick={() => retry(refresh)}>Try again</BusyButton>
        </div>
      )}
      {(loadingMore || (loaded?.length === limit && limit < MAX)) && (
        <BusyButton variant="outline" className="mt-3" busy={loadingMore} onClick={() => setLimit(limit + PAGE)}>Load more</BusyButton>
      )}
      {loaded?.length === MAX && <p className="mt-3 text-sm text-muted-foreground">Showing your newest 1,000 entries.</p>}
    </section>
  )
}
