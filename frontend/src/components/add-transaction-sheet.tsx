// The one place money gets recorded. Three taps for the common case:
//   1. Add   2. type the amount (focused on open)   3. pick a category   then Save expense.
// Wallet defaults to the last one used and the date to today.
import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, ScanLine, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useApp, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { CategoryIcon } from '@/components/category-icon'
import { ResponsivePanel } from '@/components/responsive-panel'
import { SimpleSelect } from '@/components/simple-select'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { done } from '@/lib/done'
import { money, todayIso } from '@/lib/format'
import { KIND_LABEL } from '@/lib/labels'
import { suggestWalletId } from '@/lib/receipt-ocr'
import type { NewTransaction, ReceiptScan, TransactionKind } from '@/types'

const LAST_WALLET = 'anttipid-last-wallet'
const readLastWallet = () => { try { return localStorage.getItem(LAST_WALLET) ?? '' } catch { return '' } }

export function AddTransactionSheet() {
  const { add } = useApp()
  return add ? <AddFlow key={JSON.stringify(add)} /> : null
}

function AddFlow() {
  const { add, closeAdd, openDetail } = useApp()
  const { wallets, categories, category } = useRefData()
  const editing = add?.edit
  const activeWallets = wallets.filter((w) => !w.archived)

  const [mode, setMode] = useState<'form' | 'scan'>(add?.scan ? 'scan' : 'form')
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? add?.kind ?? 'expense')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [pickedWallet, setWalletId] = useState(editing?.walletId ?? readLastWallet())
  const [toWalletId, setToWalletId] = useState(editing?.toWalletId ?? '')
  const [date, setDate] = useState(editing?.date ?? todayIso())
  const [title, setTitle] = useState(editing?.title ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [receipt, setReceipt] = useState<ReceiptScan | null>(null)
  const [saving, setSaving] = useState(false)

  // Fall back to the first wallet when nothing was used before (or the remembered one is gone).
  const walletId = editing || activeWallets.some((w) => w.id === pickedWallet) ? pickedWallet : (activeWallets[0]?.id ?? '')
  const value = Number(amount)
  const missing =
    !(value > 0) ? 'Enter an amount' :
    kind !== 'transfer' && !categoryId ? 'Pick a category' :
    !walletId ? 'Choose a wallet' :
    kind === 'transfer' && !toWalletId ? 'Choose where the money goes' :
    kind === 'transfer' && toWalletId === walletId ? 'Pick two different wallets' :
    null

  async function save() {
    if (missing) return
    setSaving(true)
    const body: NewTransaction = {
      kind,
      amount: Math.round(value * 100) / 100,
      title: title.trim() || (kind === 'transfer' ? 'Transfer' : category(categoryId)?.name ?? KIND_LABEL[kind]),
      date,
      walletId,
      toWalletId: kind === 'transfer' ? toWalletId : undefined,
      categoryId: kind === 'transfer' ? undefined : categoryId,
      note: note.trim(),
      source: receipt || editing?.source === 'receipt' ? 'receipt' : 'manual',
    }
    try {
      const saved = editing ? await api.transactions.update(editing.id, body) : await api.transactions.create(body)
      try { localStorage.setItem(LAST_WALLET, walletId) } catch { /* private mode */ }
      closeAdd()
      done(editing ? 'Changes saved' : `${KIND_LABEL[kind]} saved`, {
        description: `${money(body.amount)}, ${body.title}`,
        action: { label: 'View', onClick: () => openDetail(saved.id) },
      })
    } catch (e) {
      toast.error((e as Error).message)
      setSaving(false)
    }
  }

  function applyReceipt(r: ReceiptScan) {
    setReceipt(r)
    setKind('expense')
    setAmount(r.total.toFixed(2))
    setTitle(r.merchant)
    setDate(r.date)
    setCategoryId(r.suggestedCategoryId ?? '')
    const suggestedWallet = suggestWalletId(r, wallets)
    if (suggestedWallet) setWalletId(suggestedWallet)
    setNote(r.items.map((i) => `${i.qty} x ${i.name}`).join('\n'))
    setMode('form')
  }

  const onOpenChange = (open: boolean) => { if (!open) closeAdd() }

  if (mode === 'scan') return <ScanStep onOpenChange={onOpenChange} onBack={() => setMode('form')} onDone={applyReceipt} />

  const walletOptions = activeWallets.map((w) => ({ value: w.id, label: w.name }))
  const shownCategories = categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense'))

  return (
    <ResponsivePanel
      open
      onOpenChange={onOpenChange}
      title={editing ? 'Edit transaction' : 'Add transaction'}
      description={receipt ? `Filled in from your ${receipt.merchant} receipt. Check it, then save.` : 'Amount and category are all you need.'}
      footer={
        <>
          {missing && <p className="text-sm text-muted-foreground" aria-live="polite">{missing}.</p>}
          <Button type="submit" form="add-form" disabled={!!missing || saving}>
            {saving && <Loader2 className="animate-spin" />}
            {editing ? 'Save changes' : `Save ${KIND_LABEL[kind].toLowerCase()}`}
          </Button>
        </>
      }
    >
      <form id="add-form" className="grid gap-6 pb-4" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Tabs value={kind} onValueChange={(v) => { setKind(v as TransactionKind); setCategoryId('') }}>
          <TabsList className="w-full">
            {(Object.keys(KIND_LABEL) as TransactionKind[]).map((k) => <TabsTrigger key={k} value={k}>{KIND_LABEL[k]}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        <div className="grid gap-2">
          <Label htmlFor="amount">Amount</Label>
          <InputGroup>
            <InputGroupAddon><InputGroupText>₱</InputGroupText></InputGroupAddon>
            <InputGroupInput
              id="amount"
              autoFocus={!editing}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
            />
          </InputGroup>
          {kind === 'expense' && !editing && !receipt && (
            <Button type="button" variant="link" className="justify-self-start px-0" onClick={() => setMode('scan')}>
              <ScanLine /> Scan a receipt instead
            </Button>
          )}
        </div>

        {kind === 'transfer' ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="from">From</Label>
              <SimpleSelect id="from" value={walletId} onChange={setWalletId} options={walletOptions} placeholder="Choose wallet" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="to">To</Label>
              <SimpleSelect id="to" value={toWalletId} onChange={setToWalletId} options={walletOptions} placeholder="Choose wallet" />
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label id="category-label">Category</Label>
            <ToggleGroup
              aria-labelledby="category-label"
              variant="outline"
              className="grid w-full grid-cols-2"
              value={categoryId ? [categoryId] : []}
              onValueChange={(v) => setCategoryId((v as string[])[0] ?? '')}
            >
              {shownCategories.map((c) => (
                <ToggleGroupItem key={c.id} value={c.id} className="justify-start">
                  <CategoryIcon category={c} kind={kind} />
                  {c.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {kind !== 'transfer' && (
            <div className="grid gap-2">
              <Label htmlFor="wallet">{kind === 'income' ? 'Into wallet' : 'Paid from'}</Label>
              <SimpleSelect id="wallet" value={walletId} onChange={setWalletId} options={walletOptions} placeholder="Choose wallet" />
            </div>
          )}
          <div className={kind === 'transfer' ? 'col-span-2 grid gap-2' : 'grid gap-2'}>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="title">Description (optional)</Label>
          <Input id="title" placeholder={kind === 'transfer' ? 'e.g. Top up GCash' : 'e.g. Lunch at Jollibee'} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </form>
    </ResponsivePanel>
  )
}

/**
 * Get a receipt photo two ways: live camera scanner (getUserMedia) or file upload.
 * Either way the photo goes to the same reader, then back to the form to check and save.
 */
function ScanStep({ onOpenChange, onBack, onDone }: { onOpenChange: (o: boolean) => void; onBack: () => void; onDone: (r: ReceiptScan) => void }) {
  const [state, setState] = useState<'idle' | 'camera' | 'reading' | 'error'>('idle')
  const [cameraError, setCameraError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ReceiptScan | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }
  // Release the camera whenever the panel closes.
  useEffect(() => stopCamera, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function read(file: File) {
    setPreview(URL.createObjectURL(file))
    setResult(null)
    setState('reading')
    try {
      setResult(await api.receipts.scan(file))
      setState('idle')
    } catch {
      setState('error')
    }
  }

  async function startCamera() {
    setCameraError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('The camera only works over a secure (https) connection. Upload a photo instead.')
      return
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      setState('camera')
    } catch (e) {
      setCameraError((e as Error).name === 'NotAllowedError'
        ? 'Camera access is blocked. Allow it in your browser settings, or upload a photo instead.'
        : 'No camera found on this device. Upload a photo instead.')
    }
  }

  function capture() {
    const v = videoRef.current
    if (!v?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')?.drawImage(v, 0, 0)
    stopCamera()
    canvas.toBlob((blob) => blob && read(new File([blob], 'receipt.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9)
  }

  function reset() {
    stopCamera()
    setPreview(null)
    setResult(null)
    setState('idle')
  }

  const footer =
    state === 'camera' ? (
      <>
        <Button onClick={capture}><Camera /> Capture receipt</Button>
        <Button variant="outline" onClick={reset}>Cancel</Button>
      </>
    ) : result ? (
      <>
        <Button onClick={() => onDone(result)}>Use these details</Button>
        <Button variant="outline" onClick={reset}>Scan another receipt</Button>
      </>
    ) : state === 'error' ? (
      <>
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={onBack}>Type it in instead</Button>
      </>
    ) : (
      <Button variant="outline" onClick={() => { stopCamera(); onBack() }}>Type it in instead</Button>
    )

  return (
    <ResponsivePanel
      open
      onOpenChange={(o) => { if (!o) stopCamera(); onOpenChange(o) }}
      title="Scan a receipt"
      description="Use your camera or upload a photo. The store, date and items are filled in for you."
      footer={footer}
    >
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} aria-label="Receipt photo" />

      {state === 'camera' ? (
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-foreground">
          <video
            ref={(v) => {
              videoRef.current = v
              if (v && streamRef.current && v.srcObject !== streamRef.current) v.srcObject = streamRef.current
            }}
            autoPlay
            playsInline
            muted
            aria-label="Camera view"
            className="size-full object-cover"
          />
          <div aria-hidden className="pointer-events-none absolute inset-6 rounded-md border-2 border-dashed border-sidebar-primary" />
          <p className="absolute inset-x-0 bottom-3 text-center text-sm text-background">Fit the whole receipt inside the frame</p>
        </div>
      ) : !preview ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ScanLine /></EmptyMedia>
            <EmptyTitle>Scan or upload a receipt</EmptyTitle>
            <EmptyDescription>Point your camera at the receipt, or pick a photo you already took. Keep the total in view.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="grid w-full gap-2 sm:grid-cols-2">
            <Button onClick={startCamera}><Camera /> Scan with camera</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Upload a photo</Button>
            {cameraError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{cameraError}</p>}
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 pb-4">
          <div className="flex items-center gap-4">
            <img src={preview} alt="Your receipt" className="h-24 w-18 shrink-0 rounded-md border object-cover" />
            <div className="grid gap-1 text-sm">
              {state === 'reading' && <p className="flex items-center gap-2"><Loader2 className="animate-spin" /> Reading your receipt…</p>}
              {state === 'error' && <p className="text-destructive">Couldn't read this photo. Try a sharper photo with the total visible.</p>}
              {result && (
                <>
                  <p className="font-medium">{result.merchant}</p>
                  <p className="text-muted-foreground">{result.items.length} items, {money(result.total)}</p>
                </>
              )}
            </div>
          </div>
          {result && (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((i) => (
                  <TableRow key={i.name}>
                    <TableCell className="whitespace-normal">{i.name}</TableCell>
                    <TableCell>{i.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(i.qty * i.price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow><TableCell colSpan={2}>Total</TableCell><TableCell className="text-right tabular-nums">{money(result.total)}</TableCell></TableRow>
              </TableFooter>
            </Table>
          )}
        </div>
      )}
    </ResponsivePanel>
  )
}
