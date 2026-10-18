/** Master horizontal lockup from design/logo/lockups. tone: 'dark' for dark surfaces (sidebar), 'auto' follows the theme. */
export function Logo({ tone = 'auto', className = 'h-10' }: { tone?: 'auto' | 'dark'; className?: string }) {
  const img = (src: string, extra = '') => <img src={src} alt="AntTipid, expense & budget tracker" className={`${className} w-auto ${extra}`} />
  if (tone === 'dark') return img('/brand/lockup-dark.svg')
  return (
    <>
      {img('/brand/lockup.svg', 'dark:hidden')}
      {img('/brand/lockup-dark.svg', 'hidden dark:block')}
    </>
  )
}
