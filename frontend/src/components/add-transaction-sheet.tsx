// The one place money gets recorded. Three taps for the common case:
//   1. Add   2. type the amount (focused on open)   3. pick a category   then Save expense.
// Wallet defaults to the last one used and the date to today.
import { lazy, startTransition, Suspense, useEffect, useRef, useState } from 'react'
import { Camera, Check, Copy, Loader2, ScanLine, TriangleAlert, Upload } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MONTH_PAGES, monthLink, useApp, useMonth, useRefData } from '@/app-state'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/use-query'
import { BusyButton } from '@/components/busy-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CategoryIcon } from '@/components/category-icon'
import { MoneyInput } from '@/components/money-input'
import { ResponsivePanel } from '@/components/responsive-panel'
import { SimpleSelect } from '@/components/simple-select'
import { AskEarlier } from '@/components/transaction-sheet'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ReceiptItems, ReceiptItemsEditor } from '@/components/receipt-items'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAction } from '@/hooks/use-action'
import { numberLine, verdictCopy } from '@/lib/budget'
import { done } from '@/lib/done'
import { currentMonth, money, monthLabel, shiftMonth, todayIso, yesterdayIso } from '@/lib/format'
import { KIND_LABEL } from '@/lib/transactions'
import { cleanReceiptItems, itemProblem, itemsTotal, shrinkPhoto, suggestWalletId, toDraftItems, type DraftReceiptItem } from '@/lib/receipt'
import type { AnomalyCheck, AnomalyDecision, NewTransaction, ReceiptScan, TransactionKind } from '@/types'

// Only a first-time user with no wallet sees this, so the add flow doesn't wait on the Settings file.
const WalletForm = lazy(() => import('@/components/wallet-form').then((m) => ({ default: m.WalletForm })))

const LAST_WALLET = 'anttipid-last-wallet'
const readLastWallet = () => { try { return localStorage.getItem(LAST_WALLET) ?? '' } catch { return '' } }

export function AddTransactionSheet() {
  const { add } = useApp()
  return add ? <AddFlow key={JSON.stringify(add)} /> : null
}

function AddFlow() {
  const { add, closeAdd, openDetail } = useApp()
  const { wallets, categories, category, loading } = useRefData()
  const editing = add?.edit
  // Edit and "Add again" both start from a transaction; only an edit keeps its date, note and receipt items.
  const from = editing ?? add?.copy
  const activeWallets = wallets.filter((w) => !w.archived)

  const [mode, setMode] = useState<'form' | 'scan'>(add?.scan ? 'scan' : 'form')
  const [kind, setKind] = useState<TransactionKind>(from?.kind ?? add?.kind ?? 'expense')
  const [amount, setAmount] = useState(from ? String(from.amount) : '')
  const [categoryId, setCategoryId] = useState(from?.categoryId ?? '')
  const [pickedWallet, setWalletId] = useState(from?.walletId ?? readLastWallet())
  const [toWalletId, setToWalletId] = useState(from?.toWalletId ?? '')
  const [date, setDate] = useState(editing?.date ?? add?.date ?? todayIso())
  const [title, setTitle] = useState(from?.title ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [receipt, setReceipt] = useState<ReceiptScan | null>(null)
  const [receiptPhoto, setReceiptPhoto] = useState<Blob | null>(null)
  const [items, setItems] = useState<DraftReceiptItem[]>(() => toDraftItems(editing?.items))
  const [addingWallet, setAddingWallet] = useState(false)
  const [run, saving] = useAction()
  // What the form opened with. Anything different is the user's work, so a swipe, tap outside or Back asks before
  // throwing it away; an untouched form just closes. (The wallet is left out: it starts on a remembered default.)
  const draft = JSON.stringify([kind, amount, categoryId, toWalletId, date, title, note, items, receipt])
  const [opened] = useState(draft)
  const [discarding, setDiscarding] = useState(false)
  // Ignored while the question is up: a tap on its buttons lands outside the sheet, which asks the sheet to close.
  const close = () => {
    if (discarding) return
    if (draft !== opened) setDiscarding(true)
    else closeAdd()
  }
  const [viewedMonth] = useMonth()
  // This month and last, the same list (and cache key) Home loads, so opening Add from Home costs no request.
  // It ranks the categories: most-used first.
  const thisMonth = currentMonth()
  const { data: recent } = useQuery(`recent:${thisMonth}`, () => api.transactions.list({ since: `${shiftMonth(thisMonth, -1)}-01` }))
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Fall back to the first wallet when nothing was used before (or the remembered one is gone).
  const walletId = editing || activeWallets.some((w) => w.id === pickedWallet) ? pickedWallet : (activeWallets[0]?.id ?? '')
  const value = Number(amount)
  // Items only count for expenses; a started row that can't be saved would otherwise vanish on save.
  const itemIndex = kind === 'expense' ? items.findIndex((i) => itemProblem(i)) : -1
  const missing =
    !(value > 0) ? 'Enter an amount' :
    kind !== 'transfer' && !categoryId ? 'Pick a category' :
    !walletId ? (activeWallets.length ? 'Choose a wallet' : 'Add a wallet in Settings first') :
    kind === 'transfer' && !toWalletId ? 'Choose where the money goes' :
    kind === 'transfer' && toWalletId === walletId ? 'Pick two different wallets' :
    itemIndex >= 0 ? `Item ${itemIndex + 1} needs ${itemProblem(items[itemIndex])}, or remove it` :
    null
  // Checked against the items as they are now, so the warning goes once they're fixed.
  const subtotal = itemsTotal(items)
  const itemsOff = kind === 'expense' && subtotal > 0 && Math.abs(subtotal - value) >= 0.01

  // DSS feature 9: before saving, is this amount unusual for its category? Then the user decides, here.
  const check = useAnomalyCheck(kind === 'expense' && categoryId && value > 0 ? { categoryId, amount: value, date, exclude: editing?.id } : null)
  const verdict = check && verdictCopy(check, value, category(categoryId)?.name ?? 'this category')
  const unusual = !!verdict?.reason
  // From the third one-off like it, a pattern: "normal" becomes the default. Otherwise one-off, the safe default.
  const primary: AnomalyDecision = verdict?.suggestHabit ? 'normal' : 'one_off'
  // Asked for one verdict only: a changed amount or category drops the question.
  const [askedFor, setAskedFor] = useState<AnomalyCheck | null>(null)
  const decide = (d: AnomalyDecision) => (d === 'normal' && check?.similar.length ? setAskedFor(check) : save(d))

  const save = (decision?: AnomalyDecision, alsoEarlier = false) => run(async () => {
    const body: NewTransaction = {
      kind,
      amount: Math.round(value * 100) / 100,
      title: title.trim() || (kind === 'transfer' ? 'Transfer' : category(categoryId)?.name ?? KIND_LABEL[kind]),
      date,
      walletId,
      toWalletId: kind === 'transfer' ? toWalletId : undefined,
      categoryId: kind === 'transfer' ? undefined : categoryId,
      note: note.trim(),
      source: kind === 'expense' && (receipt || editing?.source === 'receipt') ? 'receipt' : 'manual',
      // Items stay their own list, never folded into the note: the note is the user's free text.
      items: kind === 'expense' ? cleanReceiptItems(items, Boolean(editing?.items?.length)) : undefined,
      anomalyDecision: unusual ? decision : undefined,
      anomalyAlsoEarlier: alsoEarlier,
    }
    const saved = editing ? await api.transactions.update(editing.id, body) : await api.transactions.create(body)
    if (receiptPhoto && body.source === 'receipt') await api.transactions.uploadReceipt(saved.id, receiptPhoto)
    try { localStorage.setItem(LAST_WALLET, walletId) } catch { /* private mode */ }
    closeAdd()
    // Dated in another month than the one on screen: it won't show up here, so say where it went and offer to go there.
    const savedMonth = body.date.slice(0, 7)
    const elsewhere = savedMonth !== viewedMonth && savedMonth <= currentMonth()
    const heading = unusual && decision === 'one_off' ? 'Saved as a one-off'
      : unusual && decision === 'normal' ? 'Saved as normal spending'
      : editing ? 'Changes saved' : `${KIND_LABEL[kind]} saved`
    done(heading, elsewhere ? {
      description: `${money(body.amount)}, ${body.title}, in ${monthLabel(savedMonth)}`,
      action: {
        label: `Show ${monthLabel(savedMonth, 'short')}`,
        onClick: () => navigate(monthLink(MONTH_PAGES.has(pathname) ? pathname : '/activity', savedMonth)),
      },
    } : {
      description: `${money(body.amount)}, ${body.title}`,
      action: { label: 'View', onClick: () => openDetail(saved.id) },
    })
  })

  function applyReceipt(r: ReceiptScan, photo: Blob) {
    setReceipt(r)
    setReceiptPhoto(photo)
    setItems(toDraftItems(r.items))
    setKind('expense')
    setAmount(r.total.toFixed(2))
    setTitle(r.merchant)
    setDate(r.date)
    setCategoryId(r.suggestedCategoryId ?? '')
    const suggestedWallet = suggestWalletId(r, wallets)
    if (suggestedWallet) setWalletId(suggestedWallet)
    setMode('form')
  }

  // The wallet form opens in place: once it's saved there is a wallet, so the transaction form takes over.
  // The transition keeps this panel up while the form's file loads, so the two panels swap in one step.
  if (!editing && !loading && !activeWallets.length) {
    return (
      <Suspense fallback={null}>
        {addingWallet ? <WalletForm onClose={() => setAddingWallet(false)} /> : (
          <ResponsivePanel onClose={closeAdd} title="Add a wallet first" description="Every transaction is paid from or into a wallet.">
            <div className="grid gap-4 pb-4">
              <p className="text-sm text-muted-foreground">Add the cash, GCash or bank account you pay from, then record what you spend.</p>
              <Button onClick={() => startTransition(() => setAddingWallet(true))}>Add a wallet</Button>
            </div>
          </ResponsivePanel>
        )}
      </Suspense>
    )
  }

  if (mode === 'scan') return <ScanStep onClose={closeAdd} onBack={() => setMode('form')} onDone={applyReceipt} />

  const walletOptions = activeWallets.map((w) => ({ value: w.id, label: w.name }))
  const uses = Map.groupBy(recent ?? [], (t) => t.categoryId)
  // Most-used first; sort is stable, so unused ones keep their usual order.
  const shownCategories = categories
    .filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense'))
    .sort((a, b) => (uses.get(b.id)?.length ?? 0) - (uses.get(a.id)?.length ?? 0))

  return (
    <ResponsivePanel
      onClose={close}
      title={editing ? 'Edit transaction' : 'Add transaction'}
      description={receipt
        ? itemsOff
          ? `The items add up to ${money(subtotal)}, not ${money(value || 0)}. Check for a misread price or a missing item. A discount can also explain it.`
          : `Filled in from your ${receipt.merchant} receipt. Check it, then save.`
        : 'Amount and category are all you need.'}
      footer={
        <>
          {missing && <p className="text-sm text-muted-foreground" aria-live="polite">{missing}.</p>}
          {/* An unusual amount: saving is the decision. The primary is what Enter does. */}
          <BusyButton type="submit" form="add-form" busy={saving} disabled={!!missing}>
            {unusual ? DECISION_LABEL[primary] : editing ? 'Save changes' : `Save ${KIND_LABEL[kind].toLowerCase()}`}
          </BusyButton>
          {unusual && !missing && (
            <Button type="button" variant="outline" disabled={saving} onClick={() => decide(primary === 'one_off' ? 'normal' : 'one_off')}>
              {DECISION_LABEL[primary === 'one_off' ? 'normal' : 'one_off']}
            </Button>
          )}
        </>
      }
    >
      <form id="add-form" className="grid gap-6 pb-4" onSubmit={(e) => { e.preventDefault(); if (missing) return; if (unusual) decide(primary); else save() }}>
        <Tabs value={kind} onValueChange={(v) => { setKind(v as TransactionKind); setCategoryId('') }}>
          <TabsList className="w-full">
            {(Object.keys(KIND_LABEL) as TransactionKind[]).map((k) => <TabsTrigger key={k} value={k}>{KIND_LABEL[k]}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        <div className="grid gap-2">
          <Label htmlFor="amount">Amount</Label>
          <MoneyInput id="amount" autoFocus={!editing} placeholder="0.00" value={amount} onChange={setAmount} />
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
            {verdict && check && (
              <VerdictCard
                verdict={verdict}
                check={check}
                amount={value}
                askEarlier={askedFor === check}
                onAnswer={(alsoEarlier) => { setAskedFor(null); save('normal', alsoEarlier) }}
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 items-start gap-4">
          {kind !== 'transfer' && (
            <div className="grid gap-2">
              <Label htmlFor="wallet">{kind === 'income' ? 'Into wallet' : 'Paid from'}</Label>
              <SimpleSelect id="wallet" value={walletId} onChange={setWalletId} options={walletOptions} placeholder="Choose wallet" />
            </div>
          )}
          <div className={kind === 'transfer' ? 'col-span-2 grid gap-2' : 'grid gap-2'}>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            {/* Most spending is logged the same day or the day after: one tap instead of the date picker. */}
            <div className="flex gap-1">
              {([['Today', todayIso()], ['Yesterday', yesterdayIso()]] as const).map(([label, day]) => (
                <Button key={label} type="button" size="xs" variant={date === day ? 'secondary' : 'outline'} aria-pressed={date === day} onClick={() => setDate(day)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="title">Description (optional)</Label>
          <Input id="title" placeholder={kind === 'transfer' ? 'e.g. Top up GCash' : 'e.g. Lunch at Jollibee'} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {kind === 'expense' && (receipt !== null || editing?.source === 'receipt' || items.length > 0) && (
          <ReceiptItemsEditor
            items={items}
            amount={value}
            onChange={setItems}
            onUseSubtotal={(sub) => setAmount(sub.toFixed(2))}
          />
        )}
        <div className="grid gap-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </form>
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={editing ? 'Discard your changes?' : `Discard this ${KIND_LABEL[kind].toLowerCase()}?`}
        description="What you entered won't be saved."
        confirm="Discard"
        cancel="Keep editing"
        onConfirm={async () => closeAdd()}
      />
    </ResponsivePanel>
  )
}

/**
 * Get a receipt photo two ways: live camera scanner (getUserMedia) or file upload.
 * Either way the photo goes to the same reader, then back to the form to check and save.
 */
// After this long, say the wait is normal and offer a way out.
const SLOW_AFTER_S = 12

function ScanStep({ onClose, onBack, onDone }: { onClose: () => void; onBack: () => void; onDone: (r: ReceiptScan, photo: Blob) => void }) {
  const [state, setState] = useState<'idle' | 'camera' | 'preparing' | 'reading' | 'error'>('idle')
  const [cameraError, setCameraError] = useState('')
  const [scanError, setScanError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ReceiptScan | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const photoRef = useRef<Blob | null>(null)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }
  // Release the camera and drop any scan in flight whenever the panel closes.
  useEffect(() => () => { stopCamera(); abortRef.current?.abort() }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => {
    if (state !== 'reading') return
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [state])

  async function read(file: Blob) {
    const abort = new AbortController()
    abortRef.current = abort
    setResult(null)
    setState('preparing')
    let photo: Blob
    try {
      // Shrink once: the small copy is both the preview and the upload, so the phone never renders the full photo.
      photo = await shrinkPhoto(file)
      photoRef.current = photo
    } catch {
      setScanError("Couldn't open this photo. Pick a JPEG or PNG image.")
      setState('error')
      return
    }
    try {
      setPreview(URL.createObjectURL(photo))
      setElapsed(0)
      setState('reading')
      const scan = await api.receipts.scan(photo, abort.signal)
      if (abort.signal.aborted) return
      setResult(scan)
      setState('idle')
    } catch (e) {
      if (abort.signal.aborted) return
      // The backend's messages say what to do next ("Try a sharper photo...", and http() words a dropped connection
      // the same way). A proxy error when the backend is down has none: http() falls back to "Request failed (502)".
      const message = (e as Error).message
      setScanError(message.startsWith('Request failed') ? "Couldn't reach the receipt reader. Try again in a minute, or type it in." : message)
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

  async function capture() {
    const v = videoRef.current
    if (!v?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')?.drawImage(v, 0, 0)
    stopCamera()
    // Sync encode, not canvas.toBlob (see shrinkPhoto); read() then shrinks it like an upload.
    read(await (await fetch(canvas.toDataURL('image/jpeg', 0.9))).blob())
  }

  function reset() {
    stopCamera()
    abortRef.current?.abort()
    photoRef.current = null
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
        <Button onClick={() => onDone(result, photoRef.current!)}>Use these details</Button>
        <Button variant="outline" onClick={reset}>Scan another receipt</Button>
      </>
    ) : state === 'preparing' || state === 'reading' ? (
      <>
        {elapsed >= SLOW_AFTER_S && <Button onClick={() => { abortRef.current?.abort(); onBack() }}>Type it in instead</Button>}
        <Button variant="outline" onClick={reset}>Cancel scan</Button>
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
      onClose={onClose}
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
            {state === 'error' && <p role="alert" className="text-sm text-destructive sm:col-span-2">{scanError}</p>}
          </EmptyContent>
        </Empty>
      ) : result ? (
        <div className="grid gap-4 pb-4">
          <div className="flex items-center gap-4">
            <img src={preview} alt="Your receipt" className="h-24 w-18 shrink-0 rounded-md border object-cover" />
            <div className="grid gap-1 text-sm">
              <p className="font-medium">{result.merchant}</p>
              <p className="text-muted-foreground">{result.items.length} items, {money(result.total)}</p>
              {result.lowConfidence && <p className="text-destructive">The items don't add up to the total. Check them on the next step.</p>}
            </div>
          </div>
          <ReceiptItems items={result.items} total={result.total} reveal />
        </div>
      ) : (
        <div className="grid gap-4 pb-4">
          <div className="relative mx-auto aspect-[3/4] h-[min(26rem,45dvh)] overflow-hidden rounded-lg border bg-muted">
            <img src={preview} alt="Your receipt" className="size-full object-cover" />
            {state === 'reading' && (
              <>
                <div aria-hidden className="absolute inset-0 bg-primary/15" />
                <div aria-hidden className="receipt-scan-bar motion-reduce:hidden" />
              </>
            )}
          </div>
          {state === 'error' ? (
            <p role="alert" className="text-sm text-destructive">{scanError}</p>
          ) : (
            <ol className="grid gap-2 text-sm" aria-live="polite">
              <ScanPhase status={state === 'preparing' ? 'active' : 'done'}>Photo prepared</ScanPhase>
              <ScanPhase status={state === 'reading' ? 'active' : 'waiting'} seconds={state === 'reading' ? elapsed : undefined}>
                Reading the store, date and items
              </ScanPhase>
              {elapsed >= SLOW_AFTER_S && (
                <li className="pl-7 text-muted-foreground">Taking longer than usual. Busy readers can need up to a minute.</li>
              )}
            </ol>
          )}
        </div>
      )}
    </ResponsivePanel>
  )
}

function ScanPhase({ status, seconds, children }: { status: 'done' | 'active' | 'waiting'; seconds?: number; children: string }) {
  return (
    <li className={status === 'waiting' ? 'flex items-center gap-3 text-muted-foreground' : 'flex items-center gap-3'}>
      {status === 'done' ? <Check className="size-4 text-chart-1" /> :
        status === 'active' ? <Loader2 className="size-4 animate-spin text-primary" /> :
        <span aria-hidden className="mx-1 size-2 rounded-full bg-border" />}
      <span>{children}{status === 'active' && <span className="sr-only"> (in progress)</span>}</span>
      {seconds !== undefined && <span aria-hidden className="ml-auto tabular-nums text-muted-foreground">{seconds}s</span>}
    </li>
  )
}

const DECISION_LABEL: Record<AnomalyDecision, string> = { one_off: 'Save as one-off', normal: "It's normal for me" }

/**
 * The same check the history uses (DSS feature 9), on what's being typed: waits for typing to pause, and gives nothing
 * until it has, so a verdict never belongs to an old amount. `q` null: not an expense with a category and amount yet.
 */
function useAnomalyCheck(q: { categoryId: string; amount: number; date: string; exclude?: string } | null) {
  const key = q && JSON.stringify(q)
  const [settled, setSettled] = useState(key)
  useEffect(() => {
    const id = setTimeout(() => setSettled(key), 400)
    return () => clearTimeout(id)
  }, [key])
  const { data } = useQuery(`anomaly-check:${settled}`, () => (settled ? api.anomalies.check(JSON.parse(settled)) : Promise.resolve(null)))
  return settled === key ? data ?? null : null
}

/**
 * The verdict before saving: why it's unusual, the evidence on a number line (the usual band, and this amount), what
 * came before, and what each choice does; or a likely duplicate. After "It's normal for me" with earlier one-offs like
 * it, asks once whether they're normal too. Inline, not a dialog: it informs a save already under way.
 */
function VerdictCard({ verdict, check, amount, askEarlier, onAnswer }: {
  verdict: NonNullable<ReturnType<typeof verdictCopy>>
  check: AnomalyCheck
  amount: number
  askEarlier: boolean
  onAnswer: (alsoEarlier: boolean) => void
}) {
  if (!verdict.reason) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
        <Copy aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        {verdict.duplicate}
      </p>
    )
  }
  const line = check.usualLow !== null && check.usualHigh !== null ? numberLine(check.usualLow, check.usualHigh, amount) : null
  return (
    <div role="status" className="grid gap-3 rounded-lg bg-destructive/5 p-3 text-sm">
      <p className="flex items-start gap-2 font-medium text-destructive">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {verdict.reason}
      </p>
      {line && (
        <div aria-hidden className="grid gap-1.5">
          <div className="relative h-2 rounded-full bg-muted">
            <div className="absolute inset-y-0 rounded-full bg-primary/35" style={{ left: `${line.bandLeft}%`, width: `${line.bandWidth}%` }} />
            <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive ring-2 ring-card" style={{ left: `${line.marker}%` }} />
          </div>
          <div className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
            <span>Usual {money(check.usualLow!, { whole: true })} to {money(check.usualHigh!, { whole: true })}</span>
            <span>This {money(amount, { whole: true })}</span>
          </div>
        </div>
      )}
      {verdict.context && <p>{verdict.context}</p>}
      {verdict.duplicate && <p>{verdict.duplicate}</p>}
      {askEarlier ? (
        <AskEarlier earlier={check.similar} onAnswer={onAnswer} />
      ) : (
        <p className="text-muted-foreground">
          A one-off is left out of your daily pace. Normal spending teaches AntTipid your habits.{' '}
          <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => document.getElementById('amount')?.focus()}>
            Fix the amount
          </button>
        </p>
      )}
    </div>
  )
}
