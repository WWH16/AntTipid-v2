// The bell: an unread count, and the list of what AntTipid has warned about. The server decides what goes in it.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api/endpoints'
import { setCached, useQuery } from '@/api/use-query'
import { ResponsivePanel } from '@/components/responsive-panel'
import { ErrorState, LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { auditTime } from '@/lib/audit'
import { nextToast } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import type { NotificationList } from '@/types'

const useNotifications = () => useQuery('notifications', api.notifications.list)

/** A toast when a reload after a save brings something new. Call once, in the app shell. */
export function useNotificationToast() {
  const { data } = useNotifications()
  const lastSeen = useRef<number | null>(null)
  useEffect(() => {
    if (!data) return
    const next = nextToast(lastSeen.current, data.items)
    lastSeen.current = next.lastSeen
    if (next.title) toast(next.title)
  }, [data])
}

function Count({ unread, className }: { unread: number; className?: string }) {
  if (!unread) return null
  return <span aria-hidden className={cn('flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-none font-medium text-white tabular-nums', className)}>{unread > 9 ? '9+' : unread}</span>
}

export function NotificationBell({ sidebar }: { sidebar?: boolean }) {
  const { data, error, loading } = useNotifications()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const unread = data?.unread ?? 0
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'

  function show() {
    setOpen(true)
    if (!unread) return
    setCached<NotificationList>('notifications', (d) => ({ ...d, unread: 0 }))
    // If this fails, the count comes back on the next reload: nothing to tell anyone.
    void api.notifications.read().catch(() => {})
  }

  const panel = open && (
    <ResponsivePanel onClose={() => setOpen(false)} title="Notifications" description="Warnings about your budgets and purchases.">
      {error ? <ErrorState error={error} /> : loading ? <LoadingItems rows={3} amount={false} /> : !data?.items.length ? (
        <p className="pb-4 text-sm text-muted-foreground">No notifications yet.</p>
      ) : (
        <ItemGroup className="pb-4">
          {data.items.map((n) => (
            <Item
              key={n.id}
              size="sm"
              // Replace, not push: the panel's own history entry goes, so Back leaves the page it opened on.
              render={<button type="button" onClick={() => { setOpen(false); navigate(n.link, { replace: true }) }} />}
              className="w-full text-left hover:bg-muted"
            >
              <ItemContent>
                <ItemTitle className="line-clamp-none break-words">{n.title}</ItemTitle>
                {n.body && <ItemDescription className="line-clamp-none break-words">{n.body}</ItemDescription>}
                <p className="text-xs text-muted-foreground">{auditTime(n.createdAt)}</p>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </ResponsivePanel>
  )

  if (sidebar) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton aria-label={label} onClick={show}>
          <Bell />
          <span>Notifications</span>
          <Count unread={unread} className="ml-auto" />
        </SidebarMenuButton>
        {panel}
      </SidebarMenuItem>
    )
  }
  return (
    <>
      {/* 36px, 44px to the thumb, like the avatar beside it. */}
      <Button variant="ghost" size="icon" aria-label={label} className="relative after:absolute after:-inset-1" onClick={show}>
        <Bell />
        <Count unread={unread} className="absolute -top-0.5 -right-0.5" />
      </Button>
      {panel}
    </>
  )
}
