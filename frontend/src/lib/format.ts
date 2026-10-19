const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const pesoWhole = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })

/** ₱1,234.50 — or ₱1,235 with whole: true for headline numbers. */
export const money = (n: number, opts: { whole?: boolean } = {}) => (opts.whole ? pesoWhole : peso).format(n)

/** Local calendar date as YYYY-MM-DD (not UTC). */
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const todayIso = () => isoDate(new Date())
export const currentMonth = () => todayIso().slice(0, 7)

const parse = (iso: string) => new Date(`${iso.length === 7 ? iso + '-01' : iso}T12:00:00`)

export const monthLabel = (month: string, style: 'long' | 'short' = 'long') =>
  parse(month).toLocaleDateString('en-PH', style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' })

export const shiftMonth = (month: string, by: number) => {
  const d = parse(month)
  d.setMonth(d.getMonth() + by)
  return isoDate(d).slice(0, 7)
}

/** Day `day` of `month` (YYYY-MM) as YYYY-MM-DD. */
export const dayIso = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`

/** "Today", "Yesterday", or "Mon, 13 Oct". */
export function dayLabel(iso: string) {
  const t = todayIso()
  if (iso === t) return 'Today'
  const y = new Date(parse(t).getTime() - 864e5).toISOString().slice(0, 10)
  if (iso === y) return 'Yesterday'
  return parse(iso).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const longDate = (iso: string) =>
  parse(iso).toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
