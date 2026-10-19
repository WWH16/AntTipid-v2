/** Master horizontal lockup from design/logo/lockups. tone: 'dark' for dark surfaces (sidebar). */
export function Logo({ tone = 'light', className = 'h-10' }: { tone?: 'light' | 'dark'; className?: string }) {
  return <img src={tone === 'dark' ? '/brand/lockup-dark.svg' : '/brand/lockup.svg'} alt="AntTipid, expense & budget tracker" className={`${className} w-auto`} />
}
