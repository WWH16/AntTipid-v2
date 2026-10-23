/** Peso Belly wordmark from design/logo/kit, with the tagline set as real text so it can be sized on its own. */
export function LogoWithTagline({ tone = 'light', height = 48, small = false }: { tone?: 'light' | 'dark'; height?: number; small?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <img src={tone === 'dark' ? '/brand/logo-reversed.svg' : '/brand/logo-color.svg'} alt="AntTipid" style={{ height }} className="w-auto" />
      <p className={`${small ? 'text-[11px] sm:text-xs' : 'text-sm'} leading-tight font-medium tracking-tight whitespace-nowrap ${tone === 'dark' ? 'text-[#DCEFCF]' : 'text-[#2A4D12]'}`}>
        Expense &amp; budget tracker
      </p>
    </div>
  )
}
