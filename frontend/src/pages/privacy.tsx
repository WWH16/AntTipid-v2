// Public privacy policy, linked from the sign-in screen and from Google's consent screen (Google Auth Platform > Branding).
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoWithTagline } from '@/components/logo'

const CONTACT = 'anttipid.support@gmail.com'
const UPDATED = 'October 22, 2026'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-base leading-snug sm:text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

const Mail = () => <a href={`mailto:${CONTACT}`} className="font-medium text-foreground underline underline-offset-4">{CONTACT}</a>

const PAGE_URL = 'https://ant-tipid-v2-frontend.vercel.app/privacy'

export function PrivacyPage() {
  useEffect(() => { document.title = 'Privacy policy | AntTipid' }, [])
  // index.html says the canonical URL is /. Point it here while this page is open so search engines index /privacy on its own,
  // and put / back on the way out.
  useEffect(() => {
    const canonical = document.querySelector('link[rel=canonical]')
    const ogUrl = document.querySelector('meta[property="og:url"]')
    const home = canonical?.getAttribute('href') ?? ''
    canonical?.setAttribute('href', PAGE_URL)
    ogUrl?.setAttribute('content', PAGE_URL)
    return () => {
      canonical?.setAttribute('href', home)
      ogUrl?.setAttribute('content', home)
    }
  }, [])
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-10 md:py-16">
      <Link to="/sign-in" aria-label="AntTipid sign in" className="w-fit"><LogoWithTagline height={44} small /></Link>

      <header className="grid gap-2">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl md:text-4xl">Privacy policy</h1>
        <p className="text-sm text-muted-foreground">Last updated {UPDATED}</p>
      </header>

      <div className="grid gap-7 text-[0.95rem] sm:gap-8 leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1.5">
        <p className="text-foreground">
          AntTipid is a personal expense and budget tracker. This page explains what it keeps about you, why, and how to have it deleted.
        </p>

        <Section title="What AntTipid keeps">
          <ul>
            <li><span className="text-foreground">Your account:</span> your name and email address. If you sign in with Google, Google shares your name, email address and profile picture with AntTipid. The app only uses your name and email.</li>
            <li><span className="text-foreground">What you enter:</span> wallets, categories, transactions, budgets, and receipt photos and items you attach to a transaction.</li>
          </ul>
          <p>AntTipid has no ads and no analytics or tracking tools, and it never sells or rents your information.</p>
        </Section>

        <Section title="How it's used">
          <p>Only to run the app for you: signing you in, saving your records, and showing your balances, budgets and reports. Your records are private to your account, and other users can't see them.</p>
        </Section>

        <Section title="Receipt scanning">
          <p>
            When you scan a receipt, the photo is sent to an AI service to read the store, date, items and total: free models on OpenRouter, or Google Gemini if those fail.
            AntTipid doesn't keep the scan itself; only what you choose to save. Those services handle the photo under their own terms, and free models may keep what they receive, so don't scan receipts that show information you'd rather not share.
          </p>
        </Section>

        <Section title="Where it's stored">
          <p>
            Your account, records and receipt photos are stored with Supabase (database, file storage and sign-in). The app is hosted on Vercel.
            The sign-in page uses Cloudflare Turnstile to check that a person, not a bot, is signing in. For that check, your browser sends Cloudflare some
            details about itself and your device, which Cloudflare handles under its own privacy policy.
            Your session is kept in your browser's local storage so you stay signed in. Signing out clears it.
          </p>
        </Section>

        <Section title="Information from Google">
          <p>
            AntTipid's use of information received from Google APIs follows the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-foreground underline underline-offset-4">Google API Services User Data Policy</a>,
            including its Limited Use requirements. Your Google name and email are used only to create and show your AntTipid account, and they aren't shared with anyone else.
          </p>
        </Section>

        <Section title="Deleting your data">
          <p>
            Email <Mail /> from the address you sign in with and ask for your account to be deleted. Your account, records and receipt photos will be deleted within 30 days.
            You can also delete single transactions, categories and budgets in the app at any time.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>If this policy changes, the date at the top changes with it. For questions, email <Mail />.</p>
        </Section>
      </div>

      <Link to="/sign-in" className="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Back to sign in</Link>
    </main>
  )
}
