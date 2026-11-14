// PDF downloads (Activity's transactions and the monthly report), drawn as text and tables on A4. jsPDF is only loaded
// when someone makes a PDF, so it stays out of every page's first download.
import type { jsPDF } from 'jspdf'
import { toast } from 'sonner'
import { printDate, signedAmount } from './print-report.ts'
import type { Transaction } from '@/types'

/** A table (head and rows, with `right` naming the amount columns), a line of text under it, or both. */
export type PdfSection = { heading: string; head?: string[]; rows?: string[][]; right?: number[]; text?: string }

/** Transactions as a table, like the print report's. withYear: for lists that span months, such as a search. */
export const transactionTable = (
  txs: Transaction[], categoryOf: (id: string) => string | undefined, walletOf: (id?: string) => string | undefined, withYear = false,
) => ({
  head: ['Date', 'Description', 'Category', 'Wallet', 'Amount'],
  rows: txs.map((t) => [
    withYear ? `${printDate(t.date)}, ${t.date.slice(0, 4)}` : printDate(t.date),
    t.title,
    t.categoryId ? (categoryOf(t.categoryId) ?? 'Other') : '—',
    `${walletOf(t.walletId) ?? '—'}${t.kind === 'transfer' ? ` to ${walletOf(t.toWalletId) ?? 'wallet'}` : ''}`,
    signedAmount(t.kind, t.amount),
  ]),
  right: [4],
})

/** Text the PDF's built-in Helvetica can draw. It has no ₱, so amounts read "PHP 1,250.00"; characters it can't draw at
 *  all, such as emoji, are left out rather than printed as junk. ponytail: embed a font with ₱ if "PHP" ever won't do. */
export const pdfText = (s: string) =>
  s.replace(/₱/g, 'PHP ').replace(/[−–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff]/gu, '')

const MARGIN = 40 // points, about 14 mm

/** "AntTipid", the title, the lines under it, then each section. */
export async function buildPdf(title: string, lines: string[], sections: PdfSection[]): Promise<jsPDF> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  const bottom = doc.internal.pageSize.getHeight() - MARGIN
  let y = MARGIN // top of the next line
  const write = (text: string, size: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
    for (const line of doc.splitTextToSize(pdfText(text), width) as string[]) {
      if (y + size > bottom) { doc.addPage(); y = MARGIN }
      doc.text(line, MARGIN, y, { baseline: 'top' })
      y += size * 1.4
    }
  }

  write('AntTipid', 11, true)
  write(title, 20, true)
  y += 2
  lines.forEach((line) => write(line, 10))
  for (const s of sections) {
    y += 12
    if (y > bottom - 60) { doc.addPage(); y = MARGIN } // keep a heading with the start of its table
    write(s.heading, 13, true)
    if (s.head && s.rows) autoTable(doc, {
      startY: y - 4,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      head: [s.head.map(pdfText)],
      body: s.rows.map((row) => row.map(pdfText)),
      styles: { fontSize: 9, cellPadding: 4, textColor: 20, lineColor: 200, lineWidth: { bottom: 0.5 } },
      headStyles: { fontStyle: 'bold', lineColor: 120, lineWidth: { bottom: 0.8 } },
      // Head and body alike, so an amount column's name sits over its numbers.
      didParseCell: (d) => { if (s.right?.includes(d.column.index)) d.cell.styles.halign = 'right' },
      didDrawPage: (d) => { y = (d.cursor?.y ?? y) + 8 }, // the last call is on the table's last page
    })
    if (s.text) write(s.text, 10)
  }
  return doc
}

/** Build the PDF and hand it to the browser as a download. A failure becomes an error toast. */
export const savePdf = (fileName: string, ...args: Parameters<typeof buildPdf>) => buildPdf(...args)
  .then((doc) => doc.save(fileName), (e: Error) => toast.error("Couldn't make the PDF", { description: e.message }))
