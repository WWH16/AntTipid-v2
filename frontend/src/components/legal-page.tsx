// Shared frame for the public Privacy policy and Terms pages: logo, title, date, readable column, link back to sign-in.
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoWithTagline } from '@/components/logo'

const CONTACT = 'anttipid.support@gmail.com'
const SITE = 'https://ant-tipid-v2-frontend.vercel.app'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-base leading-snug sm:text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

export const Mail = () => <a href={`mailto:${CONTACT}`} className="font-medium text-foreground underline underline-offset-4">{CONTACT}</a>

export function LegalPage({ title, path, updated, intro, children }: {
  title: string
  path: string // e.g. /privacy
  updated: string
  intro: ReactNode
  children: ReactNode
}) {
  useEffect(() => { document.title = `${title} | AntTipid` }, [title])
  // index.html says the canonical URL is /. Point it here while this page is open so search engines index it on its own,
  // and put / back on the way out.
  useEffect(() => {
    const canonical = document.querySelector('link[rel=canonical]')
    const ogUrl = document.querySelector('meta[property="og:url"]')
    const home = canonical?.getAttribute('href') ?? ''
    canonical?.setAttribute('href', SITE + path)
    ogUrl?.setAttribute('content', SITE + path)
    return () => {
      canonical?.setAttribute('href', home)
      ogUrl?.setAttribute('content', home)
    }
  }, [path])
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-10 md:py-16">
      <Link to="/sign-in" aria-label="AntTipid sign in" className="w-fit"><LogoWithTagline height={37} small /></Link>

      <header className="grid gap-2">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl md:text-4xl">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {updated}</p>
      </header>

      <div className="grid gap-7 text-[0.95rem] sm:gap-8 leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1.5">
        <p className="text-foreground">{intro}</p>
        {children}
      </div>

      <Link to="/sign-in" className="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Back to sign in</Link>
    </main>
  )
}

/** "By continuing, you agree to…" under the sign-in form: Google and email sign-in and sign-up all pass through it. */
export function ConsentNote() {
  const link = 'text-foreground underline underline-offset-4 hover:text-primary'
  return (
    <p className="text-center text-xs text-balance text-muted-foreground">
      By continuing, you agree to AntTipid's <Link to="/terms" className={link}>Terms</Link> and <Link to="/privacy" className={link}>Privacy policy</Link>.
    </p>
  )
}
