// Receipt helpers on the phone side. Reading the receipt happens on the backend (POST /receipts/scan).
import type { ReceiptItem, ReceiptScan, Wallet } from '@/types'

export interface DraftReceiptItem {
  name: string
  qty: string
  price: string
}

export const toDraftItems = (items: ReceiptItem[] = []): DraftReceiptItem[] =>
  items.map((i) => ({ name: i.name, qty: String(i.qty), price: String(i.price) }))

// Unit prices are saved to the centavo, so every total here uses the rounded price and matches after saving.
export const centavos = (price: string) => Math.round(Number(price) * 100) / 100

/** One line's total. NaN while the row is unfinished. */
export const lineTotal = (i: DraftReceiptItem) =>
  Number(i.qty) > 0 && i.price.trim() !== '' && Number(i.price) >= 0 ? Math.round(Number(i.qty) * centavos(i.price) * 100) / 100 : NaN

export function itemsTotal(items: DraftReceiptItem[]): number {
  const sum = items.reduce((acc, i) => acc + (lineTotal(i) || 0), 0)
  return Math.round(sum * 100) / 100
}

/** What a started row still needs before it can be saved, e.g. "a price". Blank rows need nothing: they're dropped. */
export function itemProblem(i: DraftReceiptItem): string | null {
  if (!i.name.trim() && i.price.trim() === '') return null
  if (!i.name.trim()) return 'a name'
  if (!(Number(i.qty) > 0)) return 'a quantity above 0'
  if (!Number.isFinite(lineTotal(i))) return 'a price'
  return null
}

export function cleanReceiptItems(items: DraftReceiptItem[], hadItems = false): ReceiptItem[] | undefined {
  const cleaned = items
    .filter((i) => i.name.trim() !== '' && Number.isFinite(lineTotal(i)))
    .map((i) => ({ name: i.name.trim(), qty: Number(i.qty), price: centavos(i.price) }))
  return cleaned.length > 0 ? cleaned : hadItems ? [] : undefined
}

/**
 * Encode a canvas to a WebP data URL at 0.75 quality (~35% smaller than JPEG at 0.8),
 * falling back to JPEG at 0.8 when the browser silently returns PNG for WebP (Safari).
 */
export function encodeCanvas(canvas: { toDataURL: (type: string, quality?: number) => string }): string {
  const webp = canvas.toDataURL('image/webp', 0.75)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.8)
}

/** Shrink a phone photo before upload: 1600px reads as well as the 4000px original at a fraction of the upload. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  // Decode straight to 1600px wide so a phone never holds the full 12MP+ photo in memory.
  // The canvas step below still caps the long side, and covers browsers that ignore resizeWidth.
  const img = await createImageBitmap(file, { resizeWidth: 1600, resizeQuality: 'high' })
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  // Not canvas.toBlob: Chrome schedules it as an idle task and it took ~1s here even for this small image,
  // while the synchronous encoder takes ~20ms.
  return (await fetch(encodeCanvas(canvas))).blob()
}

/** Wallet named like the printed payment provider (GCash, Maya), else the first wallet of that type. */
export function suggestWalletId(scan: ReceiptScan, wallets: Wallet[]): string | undefined {
  const active = wallets.filter((w) => !w.archived)
  const label = scan.paymentLabel?.toLowerCase()
  return (label ? active.find((w) => w.name.toLowerCase().includes(label)) : undefined)?.id
    ?? active.find((w) => w.type === scan.paymentMethod)?.id
}
