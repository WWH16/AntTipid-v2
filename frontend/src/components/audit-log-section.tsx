import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { SectionHeader } from '@/components/section-header'
import { EmptyState, ErrorState, LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { auditLine, auditTime } from '@/lib/audit'
import type { AuditEntry } from '@/types'

const PAGE = 50
const MAX = 1000

export function AuditLogSection() {
  const [limit, setLimit] = useState(PAGE)
  const { data: loaded, error, loading } = useQuery(`audit:${limit}`, () => api.audit.list(limit))
  // Keep the last loaded list on screen while a bigger one loads, so "Load more" doesn't flash the skeleton.
  const [last, setLast] = useState<AuditEntry[]>()
  if (loaded && loaded !== last) setLast(loaded)
  const data = loaded ?? last

  return (
    <section>
      <SectionHeader title="Audit log" description="Each sign-in and each change to your wallets, categories, transactions and budgets." />
      {error ? <ErrorState error={error} /> : loading && !data ? <LoadingItems rows={5} amount={false} /> : !data?.length ? (
        <EmptyState icon={ScrollText} title="Audit log" body="Nothing logged yet." />
      ) : (
        <>
          <ItemGroup className="-mx-3">
            {data.map((e) => {
              const { title, detail } = auditLine(e)
              return (
                <Item key={e.id} size="sm">
                  <ItemContent>
                    <ItemTitle className="line-clamp-none break-words">{title}</ItemTitle>
                    {detail && <ItemDescription className="line-clamp-none break-words">{detail}</ItemDescription>}
                    <p className="text-xs text-muted-foreground">{auditTime(e.createdAt)}</p>
                  </ItemContent>
                </Item>
              )
            })}
          </ItemGroup>
          {data.length === limit && limit < MAX && (
            <Button variant="outline" className="mt-3" disabled={loading} onClick={() => setLimit(limit + PAGE)}>Load more</Button>
          )}
        </>
      )}
    </section>
  )
}
