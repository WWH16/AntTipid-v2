// Settings as a grouped list, the way phone apps lay it out. Phones: the list, and each row opens its own screen.
// Tablet and up: the list on the left, the chosen section beside it. The section is kept in the URL (?tab=categories).
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Info, LogOut, MoreHorizontal, Pencil, Plus, ShieldCheck, Tags, Trash2, Wallet as WalletIcon } from 'lucide-react'
import { toast } from 'sonner'
import { BusyButton } from '@/components/busy-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DetailList } from '@/components/detail-list'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { dropCached, upsertCached } from '@/api/use-query'
import { CategoryMedia } from '@/components/category-icon'
import { CATEGORY_ICONS } from '@/lib/category-icons'
import { PageHeader } from '@/components/page-header'
import { ResponsivePanel } from '@/components/responsive-panel'
import { UserAvatar } from '@/components/user-avatar'
import { WalletForm } from '@/components/wallet-form'
import { WalletItem } from '@/components/wallet-item'
import { LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAction } from '@/hooks/use-action'
import { useIsMobile } from '@/hooks/use-mobile'
import { done } from '@/lib/done'
import { cn } from '@/lib/utils'
import type { Category, CategoryKind, Wallet } from '@/types'
import { version } from '../../package.json'

type Dlg =
  | { type: 'wallet'; wallet?: Wallet }
  | { type: 'category'; category?: Category; kind: CategoryKind }
  | { type: 'account' }
  | null

const SECTIONS = ['wallets', 'categories', 'account'] as const
type Section = (typeof SECTIONS)[number]

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const picked = SECTIONS.find((s) => s === params.get('tab')) // undefined: phones show the list
  const section: Section = picked ?? 'wallets' // tablet and up always show one section
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [dlg, setDlg] = useState<Dlg>(null)
  const { user, signOut } = useApp()
  const { wallets, categories, loading } = useRefData()
  const active = wallets.filter((w) => !w.archived).length
  // Phones push each screen so Back returns to the list; side by side, switching sections replaces.
  const link = (s: Section) => ({ to: { search: `?tab=${s}` }, replace: !isMobile })
  // Back to the list: the history entry this screen pushed, or (opened from a link) the list in its place.
  const back = () => ((history.state?.idx ?? 0) > 0 ? navigate(-1) : setParams({}, { replace: true }))

  return (
    <>
      <div className={cn(picked && 'max-md:hidden')}>
        <PageHeader
          page="Settings"
          headline="Settings"
          description={loading ? 'Your account, wallets and categories' : `${active} ${active === 1 ? 'wallet' : 'wallets'} and ${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`}
        />
      </div>

      {/* Two cards side by side: the list (kept in view while a long section scrolls) and the open section. Phones show one at a time. */}
      <div className="grid max-w-5xl items-start gap-4 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav aria-label="Settings" className={cn('md:sticky md:top-6', picked && 'max-md:hidden')}>
          <Card className="gap-0 divide-y py-0">
            <SettingsRow {...link('account')} current={section === 'account'} media={<UserAvatar name={user?.name} className="size-11 text-base" />} label={user?.name ?? 'Account'} description={user?.email} />

            <RowGroup title="Money">
              <SettingsRow {...link('wallets')} current={section === 'wallets'} media={<WalletIcon />} label="Wallets" value={loading ? undefined : String(active)} />
              <SettingsRow {...link('categories')} current={section === 'categories'} media={<Tags />} label="Categories" value={loading ? undefined : String(categories.length)} />
            </RowGroup>

            <RowGroup title="About">
              <SettingsRow to="/privacy" media={<ShieldCheck />} label="Privacy policy" />
              <SettingsRow media={<Info />} label="Version" value={version} />
            </RowGroup>

            <Item render={<button type="button" onClick={signOut} />} className="rounded-none text-left text-destructive hover:bg-muted">
              <ItemMedia variant="icon"><LogOut /></ItemMedia>
              <ItemContent><ItemTitle>Sign out</ItemTitle></ItemContent>
            </Item>
          </Card>
        </nav>

        <div className={cn('grid min-w-0 gap-2', !picked && 'max-md:hidden')}>
          <Button variant="ghost" className="-ml-2 justify-self-start md:hidden" onClick={back}><ChevronLeft /> Settings</Button>
          <Card className="px-4 md:px-6 md:py-6">
            {section === 'wallets' && <WalletsTab onEdit={setDlg} />}
            {section === 'categories' && <CategoriesTab onEdit={setDlg} />}
            {section === 'account' && <AccountTab onEdit={() => setDlg({ type: 'account' })} />}
          </Card>
        </div>
      </div>

      {dlg?.type === 'wallet' && <WalletForm key={dlg.wallet?.id ?? 'new'} wallet={dlg.wallet} onClose={() => setDlg(null)} />}
      {dlg?.type === 'category' && <CategoryForm key={dlg.category?.id ?? 'new'} category={dlg.category} kind={dlg.kind} onClose={() => setDlg(null)} />}
      {dlg?.type === 'account' && <AccountForm onClose={() => setDlg(null)} />}
    </>
  )
}

/** Title, one line of help and the section's main action, above its list. */
function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-lg leading-tight font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

function RowGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-2">
      <h2 className="px-3 text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

/** One row: a link with a chevron when it has somewhere to go (`to`), otherwise a plain label and value. */
function SettingsRow({ to, replace, current, media, label, description, value }: {
  to?: string | { search: string }
  replace?: boolean
  current?: boolean
  media: ReactNode
  label: string
  description?: string
  value?: string
}) {
  return (
    <Item
      render={to ? <Link to={to} replace={replace} aria-current={current ? 'page' : undefined} /> : undefined}
      className={cn('rounded-none', to && 'hover:bg-muted md:aria-[current=page]:bg-muted md:aria-[current=page]:font-medium')}
    >
      <ItemMedia variant="icon" className="text-muted-foreground">{media}</ItemMedia>
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        {description && <ItemDescription className="truncate">{description}</ItemDescription>}
      </ItemContent>
      {value && <span className="text-sm text-muted-foreground tabular-nums">{value}</span>}
      {to && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
    </Item>
  )
}

function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={label} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

function WalletsTab({ onEdit }: { onEdit: (d: Dlg) => void }) {
  const { wallets, loading } = useRefData()
  const [deleting, setDeleting] = useState<Wallet | null>(null)

  // Reversible, so no confirm step: the toast offers Undo instead. The row changes at once and goes back if the save fails.
  async function setArchived(w: Wallet, value: boolean) {
    upsertCached('wallets', { ...w, archived: value })
    try {
      await api.wallets.update(w.id, { archived: value })
      done(value ? 'Wallet archived' : 'Wallet restored', {
        description: value ? `${w.name} is hidden from new transactions. Its history stays.` : w.name,
        action: { label: 'Undo', onClick: () => setArchived(w, !value) },
        duration: 8000, // long enough to notice and reach the Undo button
      })
    } catch (e) {
      upsertCached('wallets', { ...w, archived: !value })
      toast.error((e as Error).message)
    }
  }

  return (
    <section>
      <SectionHeader
        title="Wallets"
        description="Each transaction is paid from or paid into one of these."
        action={<Button variant="outline" size="sm" aria-label="Add wallet" onClick={() => onEdit({ type: 'wallet' })}><Plus /><span className="hidden sm:inline">Add wallet</span></Button>}
      />
      {loading ? <LoadingItems rows={3} /> : !wallets.length ? (
        <p className="text-sm text-muted-foreground">No wallets yet. Add the cash, e-wallets and bank accounts you pay from.</p>
      ) : <ItemGroup className="-mx-3">
        {wallets.map((w) => (
          <WalletItem key={w.id} w={w}>
            <RowMenu label={`Options for ${w.name}`}>
              <DropdownMenuItem onClick={() => onEdit({ type: 'wallet', wallet: w })}><Pencil /> Edit</DropdownMenuItem>
              {w.archived
                ? <DropdownMenuItem onClick={() => setArchived(w, false)}><ArchiveRestore /> Restore</DropdownMenuItem>
                : <DropdownMenuItem onClick={() => setArchived(w, true)}><Archive /> Archive</DropdownMenuItem>}
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(w)}><Trash2 /> Delete</DropdownMenuItem>
            </RowMenu>
          </WalletItem>
        ))}
      </ItemGroup>}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        title={`Delete ${deleting?.name ?? 'this wallet'}?`}
        description="Only wallets with no transactions can be deleted. This can't be undone."
        confirm="Delete wallet"
        onConfirm={async () => {
          const w = deleting!
          try {
            await api.wallets.remove(w.id)
          } catch (e) {
            if ((e as { status?: number }).status !== 409) throw e
            // It has transactions: close the dialog and offer Archive, which hides it and keeps the history.
            toast.error(`${w.name} has transactions`, w.archived
              ? { description: "It can't be deleted. It's already archived, so it's hidden from new transactions." }
              : { description: 'Archive it instead to hide it and keep its history.', action: { label: 'Archive', onClick: () => setArchived(w, true) }, duration: 8000 })
            return
          }
          dropCached('wallets', w.id)
          done('Wallet deleted', { description: w.name })
        }}
      />
    </section>
  )
}

function CategoriesTab({ onEdit }: { onEdit: (d: Dlg) => void }) {
  const { categories, loading } = useRefData()
  const [deleting, setDeleting] = useState<Category | null>(null)

  return (
    <div className="grid gap-8">
      {(['expense', 'income'] as const).map((kind) => (
        <section key={kind}>
          <SectionHeader
            title={kind === 'expense' ? 'Spending categories' : 'Income categories'}
            description={kind === 'expense' ? 'Shown when you add an expense.' : 'Shown when you add income.'}
            action={<Button variant="outline" size="sm" aria-label={kind === 'expense' ? 'Add spending category' : 'Add income category'} onClick={() => onEdit({ type: 'category', kind })}><Plus /><span className="hidden sm:inline">Add category</span></Button>}
          />
          {loading ? <LoadingItems rows={kind === 'expense' ? 5 : 3} amount={false} /> : !categories.some((c) => c.kind === kind) ? (
            <p className="text-sm text-muted-foreground">
              {kind === 'expense' ? 'No spending categories. Add one to record expenses.' : 'No income categories. Add one to record income.'}
            </p>
          ) : <ItemGroup className="-mx-3">
            {categories.filter((c) => c.kind === kind).map((c) => (
              <Item key={c.id} size="sm">
                <CategoryMedia category={c} />
                <ItemContent><ItemTitle>{c.name}</ItemTitle></ItemContent>
                <ItemActions>
                  <RowMenu label={`Options for ${c.name}`}>
                    <DropdownMenuItem onClick={() => onEdit({ type: 'category', category: c, kind })}><Pencil /> Edit</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting(c)}><Trash2 /> Delete</DropdownMenuItem>
                  </RowMenu>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>}
        </section>
      ))}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        title={`Delete ${deleting?.name ?? 'this category'}?`}
        description="It disappears from the category list. This can't be undone."
        confirm="Delete category"
        onConfirm={async () => {
          await api.categories.remove(deleting!.id)
          dropCached('categories', deleting!.id)
          done('Category deleted', { description: deleting!.name })
        }}
      />
    </div>
  )
}

function AccountTab({ onEdit }: { onEdit: () => void }) {
  const { user } = useApp()
  return (
    <section>
      <SectionHeader
        title="Account"
        description="Your name and the email you sign in with."
        action={<Button variant="outline" size="sm" onClick={onEdit}><Pencil /> Edit name</Button>}
      />
      <DetailList rows={[['Name', user?.name], ['Email', user?.email]]} />
    </section>
  )
}

function AccountForm({ onClose }: { onClose: () => void }) {
  const { user, signIn } = useApp()
  const [name, setName] = useState(user?.name ?? '')
  const [run, busy] = useAction()

  const save = () => run(async () => {
    const trimmed = name.trim()
    const updated = await api.auth.updateUser(trimmed)
    signIn(updated)
    onClose()
    done('Name updated', { description: trimmed })
  })

  return (
    <ResponsivePanel
      onClose={onClose}
      title="Edit name"
      description="Shown on Home and in your account details."
      footer={<BusyButton type="submit" form="account-form" busy={busy} disabled={!name.trim()}>Save changes</BusyButton>}
    >
      <form id="account-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save() }} className="grid gap-4 pb-4">
        <div className="grid gap-2">
          <Label htmlFor="account-name">Name</Label>
          <Input id="account-name" autoFocus placeholder="Juan Dela Cruz" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </form>
    </ResponsivePanel>
  )
}

function CategoryForm({ category, kind, onClose }: { category?: Category; kind: CategoryKind; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? 'other')
  const [run, busy] = useAction()
  const title = category ? 'Edit category' : kind === 'expense' ? 'Add spending category' : 'Add income category'

  const save = () => run(async () => {
    const trimmed = name.trim()
    upsertCached('categories', category
      ? await api.categories.update(category.id, { name: trimmed, icon })
      : await api.categories.create({ name: trimmed, kind, icon }))
    onClose()
    done(category ? 'Changes saved' : 'Category added', { description: trimmed })
  })

  return (
    <ResponsivePanel
      onClose={onClose}
      title={title}
      description={category ? 'Past transactions keep this category under its updated name and icon.' : 'It appears in the category list when you add a transaction.'}
      footer={<BusyButton type="submit" form="category-form" busy={busy} disabled={!name.trim()}>{category ? 'Save changes' : title}</BusyButton>}
    >
      <form id="category-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save() }} className="grid gap-4 pb-4">
        <div className="grid gap-2">
          <Label htmlFor="cat-name">Name</Label>
          <Input id="cat-name" autoFocus placeholder="e.g. Pets, Tuition" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label id="icon-label">Icon</Label>
          <ToggleGroup aria-labelledby="icon-label" variant="outline" className="flex-wrap" value={[icon]} onValueChange={(v) => setIcon((v as string[])[0] ?? icon)}>
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <ToggleGroupItem key={key} value={key} aria-label={key[0].toUpperCase() + key.slice(1)}><Icon /></ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </form>
    </ResponsivePanel>
  )
}
