// Lockup geometry from public/brand/lockup-name*.svg (viewBox 12 14 438 132): the wordmark starts at x=175
// and its baseline sits at y=92, so the tagline is offset by those ratios to sit right under "AntTipid".
const NAME_X = (175 - 12) / 132
const BELOW_NAME = (146 - 100) / 132

/** Master lockup from design/logo/lockups, with the tagline set as real text so it can be sized on its own. */
export function LogoWithTagline({ tone = 'light', height = 56, small = false }: { tone?: 'light' | 'dark'; height?: number; small?: boolean }) {
  return (
    <div className="flex flex-col items-start">
      <img src={tone === 'dark' ? '/brand/lockup-name-dark.svg' : '/brand/lockup-name.svg'} alt="AntTipid" style={{ height }} className="w-auto" />
      <p
        style={{ marginLeft: height * NAME_X, marginTop: -height * BELOW_NAME }}
        className={`${small ? 'text-xs' : 'text-sm'} leading-tight font-medium tracking-tight whitespace-nowrap ${tone === 'dark' ? 'text-[#DCEFCF]' : 'text-[#2A4D12] dark:text-[#DCEFCF]'}`}
      >
        Expense &amp; budget tracker
      </p>
    </div>
  )
}
