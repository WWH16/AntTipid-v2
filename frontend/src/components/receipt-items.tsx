// Line items from a scanned receipt: shown after a scan and again on the saved transaction.
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { money } from '@/lib/format'
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
