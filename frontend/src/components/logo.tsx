/** Master horizontal lockup from design/logo/lockups. tone: 'dark' for dark surfaces (sidebar). */
export function Logo({ tone = 'light', className = 'h-10' }: { tone?: 'light' | 'dark'; className?: string }) {
  return <img src={tone === 'dark' ? '/brand/lockup-dark.svg' : '/brand/lockup.svg'} alt="AntTipid, expense & budget tracker" className={`${className} w-auto`} />
}

/** Lockup with the tagline set as real text so it can be sized on its own (sign-in and sign-up). */
export function LogoWithTagline() {
  return (
    <div className="flex flex-col items-center gap-2">
      <img src="/brand/lockup-name.svg" alt="AntTipid" className="h-14 w-auto" />
      <p className="text-xl font-semibold tracking-tight text-[#2A4D12] dark:text-[#DCEFCF]">Expense &amp; budget tracker</p>
    </div>
  )
}
