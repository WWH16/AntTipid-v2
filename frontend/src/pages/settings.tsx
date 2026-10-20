// Wallets, categories and account. The tab is kept in the URL (?tab=categories) so links land on the right one.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { BusyButton } from '@/components/busy-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DetailList } from '@/components/detail-list'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { CategoryMedia } from '@/components/category-icon'
import { CATEGORY_ICONS } from '@/lib/category-icons'
import { PageHeader } from '@/components/page-header'
import { MoneyInput } from '@/components/money-input'
import { ResponsivePanel } from '@/components/responsive-panel'
import { SimpleSelect } from '@/components/simple-select'
import { WalletItem } from '@/components/wallet-item'
import { LoadingItems } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BrandMark } from '@/components/brand-icons'
import { useAction } from '@/hooks/use-action'
import { done } from '@/lib/done'
import { WALLET_TYPES } from '@/lib/wallets'
import type { Category, CategoryKind, Wallet, WalletType } from '@/types'

type Dlg =
  | { type: 'wallet'; wallet?: Wallet }
  | { type: 'category'; category?: Category; kind: CategoryKind }
  | null

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'wallets'
  const [dlg, setDlg] = useState<Dlg>(null)
  const { wallets, categories, loading } = useRefData()
  const active = wallets.filter((w) => !w.archived).length

  return (
    <>
      <PageHeader
        page="Settings"
        headline="How your money is organised"
        description={loading ? 'Your wallets and categories' : `${active} ${active === 1 ? 'wallet' : 'wallets'} and ${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`}
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: String(v) }, { replace: true })}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>
        <TabsContent value="wallets"><WalletsTab onEdit={setDlg} /></TabsContent>
        <TabsContent value="categories"><CategoriesTab onEdit={setDlg} /></TabsContent>
        <TabsContent value="account"><AccountTab /></TabsContent>
      </Tabs>

      {dlg?.type === 'wallet' && <WalletForm key={dlg.wallet?.id ?? 'new'} wallet={dlg.wallet} onClose={() => setDlg(null)} />}
      {dlg?.type === 'category' && <CategoryForm key={dlg.category?.id ?? 'new'} category={dlg.category} kind={dlg.kind} onClose={() => setDlg(null)} />}
    </>
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

  // Reversible, so no confirm step: the toast offers Undo instead.
  async function setArchived(w: Wallet, value: boolean) {
    try {
      await api.wallets.update(w.id, { archived: value })
      done(value ? 'Wallet archived' : 'Wallet restored', {
        description: value ? `${w.name} is hidden from new transactions. Its history stays.` : w.name,
        action: { label: 'Undo', onClick: () => setArchived(w, !value) },
        duration: 8000, // long enough to notice and reach the Undo button
      })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Wallets</CardTitle>
        <CardDescription>Each transaction is paid from or paid into one of these.</CardDescription>
        <CardAction>{/* Icon only on phones so the description keeps the width. */}<Button variant="outline" size="sm" aria-label="Add wallet" onClick={() => onEdit({ type: 'wallet' })}><Plus /><span className="hidden sm:inline">Add wallet</span></Button></CardAction>
      </CardHeader>
      <CardContent>
        {loading ? <LoadingItems rows={3} /> : !wallets.length ? (
          <p className="text-sm text-muted-foreground">No wallets yet. Add the cash, e-wallets and bank accounts you pay from.</p>
        ) : <ItemGroup>
          {wallets.map((w) => (
            <WalletItem key={w.id} w={w}>
              <RowMenu label={`Options for ${w.name}`}>
                <DropdownMenuItem onClick={() => onEdit({ type: 'wallet', wallet: w })}><Pencil /> Rename</DropdownMenuItem>
                {w.archived
                  ? <DropdownMenuItem onClick={() => setArchived(w, false)}><ArchiveRestore /> Restore</DropdownMenuItem>
                  : <DropdownMenuItem onClick={() => setArchived(w, true)}><Archive /> Archive</DropdownMenuItem>}
              </RowMenu>
            </WalletItem>
          ))}
        </ItemGroup>}
      </CardContent>
    </Card>
  )
}

function CategoriesTab({ onEdit }: { onEdit: (d: Dlg) => void }) {
  const { categories, loading } = useRefData()
  const [deleting, setDeleting] = useState<Category | null>(null)

  return (
    <div className="grid max-w-4xl items-start gap-6 md:grid-cols-2">
      {(['expense', 'income'] as const).map((kind) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>{kind === 'expense' ? 'Spending categories' : 'Income categories'}</CardTitle>
            <CardDescription>{kind === 'expense' ? 'Shown when you add an expense.' : 'Shown when you add income.'}</CardDescription>
            <CardAction><Button variant="outline" size="sm" aria-label={kind === 'expense' ? 'Add spending category' : 'Add income category'} onClick={() => onEdit({ type: 'category', kind })}><Plus /><span className="hidden sm:inline">Add category</span></Button></CardAction>
          </CardHeader>
          <CardContent>
            {loading ? <LoadingItems rows={kind === 'expense' ? 5 : 3} amount={false} /> : !categories.some((c) => c.kind === kind) ? (
              <p className="text-sm text-muted-foreground">
                {kind === 'expense' ? 'No spending categories. Add one to record expenses.' : 'No income categories. Add one to record income.'}
              </p>
            ) : <ItemGroup>
              {categories.filter((c) => c.kind === kind).map((c) => (
                <Item key={c.id} size="sm">
                  <CategoryMedia category={c} />
                  <ItemContent><ItemTitle>{c.name}</ItemTitle></ItemContent>
                  <ItemActions>
                    <RowMenu label={`Options for ${c.name}`}>
                      <DropdownMenuItem onClick={() => onEdit({ type: 'category', category: c, kind })}><Pencil /> Rename</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleting(c)}><Trash2 /> Delete</DropdownMenuItem>
                    </RowMenu>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>}
          </CardContent>
        </Card>
      ))}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        title={`Delete ${deleting?.name ?? 'this category'}?`}
        description="It disappears from the category list. This can't be undone."
        confirm="Delete category"
        onConfirm={async () => {
          await api.categories.remove(deleting!.id)
          done('Category deleted', { description: deleting!.name })
        }}
      />
    </div>
  )
}

function AccountTab() {
  const { user, signOut } = useApp()
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Account</CardTitle>
        <CardDescription>Signed in to this prototype.</CardDescription>
        <CardAction><BrandMark mark="outline" className="size-12" /></CardAction>
      </CardHeader>
      <CardContent>
        <DetailList rows={[['Name', user?.name], ['Email', user?.email], ['Currency', 'Philippine peso (₱)']]} />
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </CardFooter>
    </Card>
  )
}

function WalletForm({ wallet, onClose }: { wallet?: Wallet; onClose: () => void }) {
  const [name, setName] = useState(wallet?.name ?? '')
  const [type, setType] = useState<string>(wallet?.type ?? 'e_wallet')
  const [balance, setBalance] = useState('')
  const [run, busy] = useAction()
  const label = wallet ? 'Rename wallet' : 'Add wallet'

  const save = () => run(async () => {
    if (wallet) await api.wallets.update(wallet.id, { name: name.trim() })
    else await api.wallets.create({ name: name.trim(), type: type as WalletType, balance: Number(balance) || 0 })
    onClose()
    done(wallet ? 'Wallet renamed' : 'Wallet added', { description: name.trim() })
  })

  return (
    <ResponsivePanel
      onClose={onClose}
      title={label}
      description={wallet ? 'The new name shows on all its transactions.' : 'Anywhere you keep money: cash, GCash, a bank account or a card.'}
      footer={<BusyButton type="submit" form="wallet-form" busy={busy} disabled={!name.trim()}>{label}</BusyButton>}
    >
      <form id="wallet-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save() }} className="grid gap-4 pb-4">
        <div className="grid gap-2">
          <Label htmlFor="wallet-name">Name</Label>
          <Input id="wallet-name" autoFocus placeholder="e.g. GCash, BPI Savings" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {!wallet && (
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="wallet-type">Type</Label>
              <SimpleSelect id="wallet-type" value={type} onChange={setType} options={WALLET_TYPES} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wallet-balance">Current balance</Label>
              <MoneyInput id="wallet-balance" placeholder="0" allowNegative value={balance} onChange={setBalance} />
            </div>
          </div>
        )}
      </form>
    </ResponsivePanel>
  )
}

function CategoryForm({ category, kind, onClose }: { category?: Category; kind: CategoryKind; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? 'other')
  const [run, busy] = useAction()
  const label = category ? 'Rename category' : kind === 'expense' ? 'Add spending category' : 'Add income category'

  const save = () => run(async () => {
    if (category) await api.categories.update(category.id, { name: name.trim() })
    else await api.categories.create({ name: name.trim(), kind, icon })
    onClose()
    done(category ? 'Category renamed' : 'Category added', { description: name.trim() })
  })

  return (
    <ResponsivePanel
      onClose={onClose}
      title={label}
      description={category ? 'Past transactions keep this category under its new name.' : 'It appears in the category list when you add a transaction.'}
      footer={<BusyButton type="submit" form="category-form" busy={busy} disabled={!name.trim()}>{label}</BusyButton>}
    >
      <form id="category-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save() }} className="grid gap-4 pb-4">
        <div className="grid gap-2">
          <Label htmlFor="cat-name">Name</Label>
          <Input id="cat-name" autoFocus placeholder="e.g. Pets, Tuition" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {!category && (
          <div className="grid gap-2">
            <Label id="icon-label">Icon</Label>
            <ToggleGroup aria-labelledby="icon-label" variant="outline" className="flex-wrap" value={[icon]} onValueChange={(v) => setIcon((v as string[])[0] ?? icon)}>
              {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
                <ToggleGroupItem key={key} value={key} aria-label={key[0].toUpperCase() + key.slice(1)}><Icon /></ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
      </form>
    </ResponsivePanel>
  )
}
