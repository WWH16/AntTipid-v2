// Receipt helpers on the phone side. Reading the receipt happens on the backend (POST /receipts/scan).
import type { ReceiptScan, Wallet } from '@/types'

/** Shrink a phone photo before upload: 1600px reads as well as the 4000px original at a fraction of the upload. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read this photo'))), 'image/jpeg', 0.8))
}

/** Wallet named like the printed payment provider (GCash, Maya), else the first wallet of that type. */
export function suggestWalletId(scan: ReceiptScan, wallets: Wallet[]): string | undefined {
  const active = wallets.filter((w) => !w.archived)
  const label = scan.paymentLabel?.toLowerCase()
  return (label ? active.find((w) => w.name.toLowerCase().includes(label)) : undefined)?.id
    ?? active.find((w) => w.type === scan.paymentMethod)?.id
}
