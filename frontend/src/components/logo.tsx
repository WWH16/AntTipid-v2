/** Master lockup from design/logo/lockups, with the tagline set as real text so it can be sized on its own. Centered on sign-in, left-aligned in the sidebar. */
export function LogoWithTagline({ tone = 'light', align = 'center', className = 'h-14' }: { tone?: 'light' | 'dark'; align?: 'center' | 'start'; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${align === 'center' ? 'items-center text-center' : 'items-start'}`}>
      <img src={tone === 'dark' ? '/brand/lockup-name-dark.svg' : '/brand/lockup-name.svg'} alt="AntTipid" className={`${className} w-auto`} />
      <p className={`text-sm leading-tight font-medium tracking-tight text-balance ${tone === 'dark' ? 'text-[#DCEFCF]' : 'text-[#2A4D12] dark:text-[#DCEFCF]'}`}>Expense &amp; budget tracker</p>
    </div>
  )
}
