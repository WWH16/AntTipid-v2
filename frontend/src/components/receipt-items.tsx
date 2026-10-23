// Line items from a scanned receipt: shown after a scan, editable on the form, and shown on the saved transaction.
import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { MoneyInput } from '@/components/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cleanMoneyInput, money } from '@/lib/format'
import { centavos, itemsTotal, lineTotal, type DraftReceiptItem } from '@/lib/receipt'
import type { ReceiptItem } from '@/types'

export function ReceiptItems({ items, total, reveal }: { items: ReceiptItem[]; total: number; reveal?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {items.map((i, n) => (
          <TableRow
            key={`${n}-${i.name}`}
            className={reveal ? 'receipt-row-in' : undefined}
            style={reveal ? { animationDelay: `${Math.min(n, 12) * 40}ms` } : undefined}
          >
            <TableCell className="whitespace-normal">{i.name}</TableCell>
            <TableCell>{i.qty}</TableCell>
            <TableCell className="text-right tabular-nums">{money(i.qty * i.price)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow><TableCell colSpan={2}>Total</TableCell><TableCell className="text-right tabular-nums">{money(total)}</TableCell></TableRow>
      </TableFooter>
    </Table>
  )
}

export function ReceiptItemsEditor({
  items,
  amount,
  onChange,
  onUseSubtotal,
}: {
  items: DraftReceiptItem[]
  amount: number
  onChange: (items: DraftReceiptItem[]) => void
  onUseSubtotal: (subtotal: number) => void
}) {
  const subtotal = itemsTotal(items)
  const differs = subtotal > 0 && Math.abs(subtotal - (Number.isFinite(amount) ? amount : 0)) >= 0.01

  const update = (index: number, patch: Partial<DraftReceiptItem>) =>
    onChange(items.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const add = () => onChange([...items, { name: '', qty: '1', price: '' }])

  // Removing a filled-in row asks first, then the toast offers Undo. A blank row just goes.
  // The target outlives the dialog so its title doesn't change while it animates closed.
  const [target, setTarget] = useState({ index: 0, name: '' })
  const [confirming, setConfirming] = useState(false)
  const latest = useRef(items)
  const undoToast = useRef<string | number>(undefined)
  useEffect(() => { latest.current = items })
  // Undo can't reach a form that's closed, so its toast goes with it.
  useEffect(() => () => { if (undoToast.current !== undefined) toast.dismiss(undoToast.current) }, [])

  function remove(index: number) {
    const row = items[index]
    onChange(items.filter((_, i) => i !== index))
    undoToast.current = toast('Item removed', {
      description: row.name.trim() || undefined,
      // Put it back where it was, keeping any edits made since.
      action: { label: 'Undo', onClick: () => onChange(latest.current.toSpliced(index, 0, row)) },
      duration: 8000,
    })
  }
  const askRemove = (index: number) => {
    const row = items[index]
    if (!row.name.trim() && !row.price) return onChange(items.filter((_, i) => i !== index))
    setTarget({ index, name: row.name.trim() })
    setConfirming(true)
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Receipt items</Label>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus /> Add item
        </Button>
      </div>
      {items.length > 0 && (
        <div className="grid gap-4">
          {/* Name gets its own line: the panel is phone-width even on desktop, too narrow for four fields in a row. */}
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2">
              <Input
                placeholder="Item name"
                aria-label={`Item ${i + 1} name`}
                className="col-span-3"
                value={item.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <InputGroup>
                <InputGroupAddon><InputGroupText>Qty</InputGroupText></InputGroupAddon>
                <InputGroupInput
                  inputMode="decimal"
                  placeholder="1"
                  aria-label={`Item ${i + 1} quantity`}
                  className="tabular-nums"
                  value={item.qty}
                  onChange={(e) => update(i, { qty: cleanMoneyInput(e.target.value) })}
                />
              </InputGroup>
              <MoneyInput
                placeholder="0.00"
                aria-label={`Item ${i + 1} unit price`}
                className="tabular-nums"
                value={item.price}
                onChange={(price) => update(i, { price })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${item.name.trim() || `item ${i + 1}`}`}
                onClick={() => askRemove(i)}
              >
                <Trash2 />
              </Button>
              {Number(item.qty) !== 1 && Number.isFinite(lineTotal(item)) && (
                <p className="col-span-3 text-right text-sm text-muted-foreground tabular-nums">
                  {item.qty} × {money(centavos(item.price))} = <span className="font-medium text-foreground">{money(lineTotal(item))}</span>
                </p>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
            <span className="text-muted-foreground tabular-nums">
              Items subtotal: <span className="font-medium text-foreground">{money(subtotal)}</span>
            </span>
            {differs && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 tabular-nums" onClick={() => onUseSubtotal(subtotal)}>
                Set amount to {money(subtotal)}
              </Button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={target.name ? `Remove ${target.name}?` : 'Remove this item?'}
        description="It comes off the receipt list. You can undo it right after."
        confirm="Remove item"
        onConfirm={async () => remove(target.index)}
      />
    </div>
  )
}
