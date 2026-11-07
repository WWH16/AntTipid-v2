// The bell: an unread count, and the list of what AntTipid has warned about. The server decides what goes in it.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, ChevronRight, CircleAlert, Gauge, Hourglass, TriangleAlert, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api/endpoints'
import { setCached, useQuery } from '@/api/use-query'
import { ResponsivePanel } from '@/components/responsive-panel'
import { ErrorState, LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { nextToast, notificationTime } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import type { AppNotification, NotificationList } from '@/types'

const useNotifications = () => useQuery('notifications', api.notifications.list)

// Red only for what's already gone wrong or needs a decision; the rest are heads-ups, in the category chip's colour.
const KIND: Record<AppNotification['kind'], { icon: LucideIcon; alert?: boolean }> = {
  near: { icon: Gauge },
  used: { icon: TriangleAlert, alert: true },
  over: { icon: TriangleAlert, alert: true },
  run_out: { icon: Hourglass },
  unusual: { icon: CircleAlert, alert: true },
  new_month: { icon: CalendarDays },
}

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

  /** The new rows keep standing out while the panel is open, so they can be found, and stop once it closes. */
  function hide() {
    setOpen(false)
    setCached<NotificationList>('notifications', (d) => ({ ...d, items: d.items.map((n) => ({ ...n, read: true })) }))
  }

  const panel = open && (
    <ResponsivePanel onClose={hide} title="Notifications" description="Warnings about your budgets and purchases.">
      {error ? <ErrorState error={error} /> : loading ? <LoadingItems rows={3} amount={false} /> : !data?.items.length ? (
        <p className="pb-4 text-sm text-muted-foreground">No notifications yet.</p>
      ) : (
        <ItemGroup className="pb-4">
          {data.items.map((n) => {
            // The frontend and API deploy separately, so a row can briefly arrive from an API that doesn't send its kind yet.
            const { icon: Icon, alert } = KIND[n.kind] ?? KIND.near
            return (
              <Item
                key={n.id}
                size="sm"
                // Replace, not push: the panel's own history entry goes, so Back leaves the page it opened on.
                render={<button type="button" onClick={() => { hide(); navigate(n.link, { replace: true }) }} />}
                className={cn('w-full text-left hover:bg-muted active:bg-muted', !n.read && 'bg-primary/5')}
              >
                <ItemMedia variant="icon" className={cn('size-8 rounded-md', alert ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground')}>
                  <Icon aria-hidden />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className={cn('line-clamp-none break-words', !n.read && 'font-semibold')}>
                    {!n.read && <span className="sr-only">Unread: </span>}{n.title}
                  </ItemTitle>
                  {n.body && <ItemDescription className="line-clamp-none break-words">{n.body}</ItemDescription>}
                  <time dateTime={n.createdAt} className="text-xs text-muted-foreground">{notificationTime(n.createdAt)}</time>
                </ItemContent>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Item>
            )
          })}
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
