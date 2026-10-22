import { ChartColumn, ChevronsUpDown, House, ListOrdered, LogOut, PiggyBank, Plus, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '@/app-state'
import { AddTransactionSheet } from '@/components/add-transaction-sheet'
import { LogoWithTagline } from '@/components/logo'
import { TransactionSheet } from '@/components/transaction-sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
} from '@/components/ui/sidebar'

const NAV = [
  { to: '/', label: 'Home', icon: House },
  { to: '/activity', label: 'Activity', icon: ListOrdered },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
]

/**
 * Tablet and laptop: shadcn Sidebar with "Add transaction" on top.
 * Phone: bottom bar with the four main pages and Add in the middle; Settings is linked from Home.
 */
export function AppShell() {
  const { openAdd } = useApp()
  const { pathname } = useLocation()
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))

  return (
    <SidebarProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-2">Skip to content</a>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="h-auto py-1" render={<NavLink to="/" />}>
                <LogoWithTagline tone="dark" height={44} small />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent className="flex flex-col gap-2">
              <Button className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" onClick={() => openAdd()}><Plus /> Add transaction</Button>
              <SidebarMenu>
                {[...NAV, { to: '/settings', label: 'Settings', icon: Settings }].map(({ to, label, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      isActive={isActive(to)}
                      className="data-active:bg-transparent data-active:text-sidebar-primary data-active:hover:bg-transparent"
                      render={<NavLink to={to} />}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:gap-6 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden">
        <div className="grid grid-cols-5 items-center gap-1 p-2">
          {NAV.slice(0, 2).map((item) => <BottomLink key={item.to} {...item} active={isActive(item.to)} />)}
          <Button
            size="icon-lg"
            className="size-14 -translate-y-4 justify-self-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-black/30 ring-4 ring-sidebar transition-transform hover:bg-sidebar-primary/90 active:scale-95"
            aria-label="Add transaction"
            onClick={() => openAdd()}
          >
            <Plus className="size-6" />
          </Button>
          {NAV.slice(2).map((item) => <BottomLink key={item.to} {...item} active={isActive(item.to)} />)}
        </div>
      </nav>

      <AddTransactionSheet />
      <TransactionSheet />
    </SidebarProvider>
  )
}

function BottomLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: typeof House; active: boolean }) {
  return (
    <Button
      variant="ghost"
      className={cn(
        'h-auto flex-col gap-1 py-1.5 text-xs text-sidebar-foreground/75 hover:bg-transparent hover:text-sidebar-foreground',
        active && 'text-sidebar-primary hover:text-sidebar-primary',
      )}
      aria-current={active ? 'page' : undefined}
      nativeButton={false}
      render={<NavLink to={to} />}
    >
      <Icon />
      {label}
    </Button>
  )
}

function UserMenu() {
  const { user, signOut } = useApp()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs opacity-70">{user.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}><Settings /> Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={signOut}><LogOut /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
