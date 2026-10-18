// Wallets, categories and account. The tab is kept in the URL (?tab=categories) so links land on the right one.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Balance } from '@/components/balance'
import { DetailList } from '@/components/detail-list'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { CategoryMedia } from '@/components/category-icon'
import { CATEGORY_ICONS } from '@/lib/category-icons'
import { PageHeader } from '@/components/page-header'
import { SimpleSelect } from '@/components/simple-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BrandMark } from '@/components/brand-icons'
import { done } from '@/lib/done'
import { WALLET_TYPES, walletTypeLabel } from '@/lib/wallets'
import type { Category, CategoryKind, Wallet, WalletType } from '@/types'

type Dlg =
  | { type: 'wallet'; wallet?: Wallet }
  | { type: 'category'; category?: Category; kind: CategoryKind }
  | null

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'wallets'
  const [dlg, setDlg] = useState<Dlg>(null)
  const { wallets, categories } = useRefData()

  return (
    <>
      <PageHeader
        page="Settings"
        headline="How your money is organised"
        description={`${wallets.filter((w) => !w.archived).length} wallets and ${categories.length} categories`}
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

      <Dialog open={dlg !== null} onOpenChange={(o) => { if (!o) setDlg(null) }}>
        <DialogContent>
          {dlg?.type === 'wallet' && <WalletForm key={dlg.wallet?.id ?? 'new'} wallet={dlg.wallet} onClose={() => setDlg(null)} />}
          {dlg?.type === 'category' && <CategoryForm key={dlg.category?.id ?? 'new'} category={dlg.category} kind={dlg.kind} onClose={() => setDlg(null)} />}
        </DialogContent>
      </Dialog>
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
  const { wallets } = useRefData()

  async function setArchived(w: Wallet, value: boolean) {
    await api.wallets.update(w.id, { archived: value })
    done(value ? 'Wallet archived' : 'Wallet restored', { description: value ? `${w.name} is hidden from new transactions. Its history stays.` : w.name })
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Wallets</CardTitle>
        <CardDescription>Each transaction is paid from or paid into one of these.</CardDescription>
        <CardAction>{/* Icon only on phones so the description keeps the width. */}<Button variant="outline" size="sm" aria-label="Add wallet" onClick={() => onEdit({ type: 'wallet' })}><Plus /><span className="hidden sm:inline">Add wallet</span></Button></CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {wallets.map((w) => (
            <Item key={w.id} size="sm">
              <ItemContent>
                <ItemTitle>{w.name} {w.archived && <Badge variant="outline">Archived</Badge>}</ItemTitle>
                <ItemDescription>{walletTypeLabel(w.type)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Balance value={w.balance} />
                <RowMenu label={`Options for ${w.name}`}>
                  <DropdownMenuItem onClick={() => onEdit({ type: 'wallet', wallet: w })}><Pencil /> Rename</DropdownMenuItem>
                  {w.archived
                    ? <DropdownMenuItem onClick={() => setArchived(w, false)}><ArchiveRestore /> Restore</DropdownMenuItem>
                    : <DropdownMenuItem onClick={() => setArchived(w, true)}><Archive /> Archive</DropdownMenuItem>}
                </RowMenu>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

function CategoriesTab({ onEdit }: { onEdit: (d: Dlg) => void }) {
  const { categories } = useRefData()

  async function remove(c: Category) {
    try {
      await api.categories.remove(c.id)
      done('Category deleted', { description: c.name })
    } catch (e) {
      toast.error(`Couldn't delete ${c.name}`, { description: (e as Error).message })
    }
  }

  return (
    <div className="grid max-w-4xl items-start gap-6 md:grid-cols-2">
      {(['expense', 'income'] as const).map((kind) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>{kind === 'expense' ? 'Spending categories' : 'Income categories'}</CardTitle>
            <CardDescription>{kind === 'expense' ? 'Shown when you add an expense.' : 'Shown when you add income.'}</CardDescription>
            <CardAction><Button variant="outline" size="sm" aria-label={kind === 'expense' ? 'Add spending category' : 'Add income category'} onClick={() => onEdit({ type: 'category', kind })}><Plus /><span className="hidden sm:inline">Add</span></Button></CardAction>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {categories.filter((c) => c.kind === kind).map((c) => (
                <Item key={c.id} size="sm">
                  <CategoryMedia category={c} />
                  <ItemContent><ItemTitle>{c.name}</ItemTitle></ItemContent>
                  <ItemActions>
                    <RowMenu label={`Options for ${c.name}`}>
                      <DropdownMenuItem onClick={() => onEdit({ type: 'category', category: c, kind })}><Pencil /> Rename</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => remove(c)}><Trash2 /> Delete</DropdownMenuItem>
                    </RowMenu>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function AccountTab() {
  const { user, signOut } = useApp()
  const navigate = useNavigate()
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
        <Button variant="outline" onClick={() => { signOut(); navigate('/sign-in') }}>Sign out</Button>
      </CardFooter>
    </Card>
  )
}

function WalletForm({ wallet, onClose }: { wallet?: Wallet; onClose: () => void }) {
  const [name, setName] = useState(wallet?.name ?? '')
  const [type, setType] = useState<string>(wallet?.type ?? 'e_wallet')
  const [balance, setBalance] = useState('')

  async function save() {
    if (!name.trim()) return
    if (wallet) await api.wallets.update(wallet.id, { name: name.trim() })
    else await api.wallets.create({ name: name.trim(), type: type as WalletType, balance: Number(balance) || 0 })
    onClose()
    done(wallet ? 'Wallet renamed' : 'Wallet added', { description: name.trim() })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{wallet ? 'Rename wallet' : 'Add wallet'}</DialogTitle>
        <DialogDescription>{wallet ? 'The new name shows on all its transactions.' : 'Anywhere you keep money: cash, GCash, a bank account or a card.'}</DialogDescription>
      </DialogHeader>
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
            <Label htmlFor="wallet-balance">Current balance (₱)</Label>
            <Input id="wallet-balance" inputMode="decimal" placeholder="0" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^\d.-]/g, ''))} />
          </div>
        </div>
      )}
      <DialogFooter><Button type="submit" disabled={!name.trim()}>{wallet ? 'Save name' : 'Add wallet'}</Button></DialogFooter>
    </form>
  )
}

function CategoryForm({ category, kind, onClose }: { category?: Category; kind: CategoryKind; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? 'other')

  async function save() {
    if (!name.trim()) return
    if (category) await api.categories.update(category.id, { name: name.trim() })
    else await api.categories.create({ name: name.trim(), kind, icon })
    onClose()
    done(category ? 'Category renamed' : 'Category added', { description: name.trim() })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{category ? 'Rename category' : kind === 'expense' ? 'Add spending category' : 'Add income category'}</DialogTitle>
        <DialogDescription>{category ? 'Past transactions keep this category under its new name.' : 'It appears in the category list when you add a transaction.'}</DialogDescription>
      </DialogHeader>
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
      <DialogFooter><Button type="submit" disabled={!name.trim()}>{category ? 'Save name' : 'Add category'}</Button></DialogFooter>
    </form>
  )
}
