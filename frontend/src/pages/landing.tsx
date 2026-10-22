// What signed-out visitors see at /: what AntTipid is and does, then sign in. Google's consent-screen review reads this page.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChartPie, PiggyBank, ReceiptText, Wallet } from 'lucide-react'
import { HeroCard } from '@/components/hero-card'
import { LogoWithTagline } from '@/components/logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'

const FEATURES = [
  { icon: Wallet, title: 'Log spending and income', body: 'Every entry goes to a wallet: cash, GCash, Maya, a bank account or a card, so your balances stay true.' },
  { icon: PiggyBank, title: 'Budget by category', body: 'Set a monthly limit for food, transport or bills, and see what’s left and whether you’re spending faster than the month.' },
  { icon: ReceiptText, title: 'Scan receipts', body: 'Take a photo of a receipt and AntTipid fills in the store, date, items and total for you to check.' },
  { icon: ChartPie, title: 'See the month at a glance', body: 'Reports show where the money went by category, and how income compares with spending.' },
]

/** A still copy of the Home card, filled with sample numbers: ₱12,000 budget, ₱5,760 spent, day 21 of 31. */
function SampleHome() {
  return (
    <figure className="grid gap-3">
      <HeroCard className="shadow-xl shadow-primary/15">
        <CardHeader>
          <CardDescription>Left to spend this month</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">₱6,240</CardTitle>
          <CardAction><Badge variant="secondary">On track</Badge></CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Progress value={48}><ProgressLabel>Budget used</ProgressLabel><ProgressValue /></Progress>
          <Progress value={68}><ProgressLabel>Month gone</ProgressLabel><ProgressValue /></Progress>
        </CardContent>
        <CardFooter className="text-sm font-medium">
          ₱2,370 below the on-budget pace. Up to ₱624 a day keeps you on budget.
        </CardFooter>
      </HeroCard>
      <figcaption className="text-center text-xs text-muted-foreground">Your Home screen, with sample numbers</figcaption>
    </figure>
  )
}

export function LandingPage() {
  useEffect(() => { document.title = 'AntTipid: expense and budget tracker' }, [])
  return (
    <div className="mx-auto grid min-h-svh w-full max-w-5xl grid-rows-[auto_1fr_auto] px-6">
      <header className="flex items-center justify-between gap-4 py-6">
        <LogoWithTagline height={44} small />
        <Button variant="ghost" nativeButton={false} render={<Link to="/sign-in" />}>Sign in</Button>
      </header>

      <main className="grid content-center gap-20 py-10 md:py-16">
        <section className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div className="grid gap-6">
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
              Know where every peso goes.
            </h1>
            <p className="max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
              AntTipid is a free expense and budget tracker for the Philippine peso. Log what you spend and earn,
              set a budget for each category, and it tells you how much is left to spend this month.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" nativeButton={false} render={<Link to="/sign-in?mode=signup" />}>Create a free account</Button>
              <Button size="lg" variant="outline" nativeButton={false} render={<Link to="/sign-in" />}>Sign in</Button>
            </div>
          </div>
          <SampleHome />
        </section>

        <section aria-labelledby="what-you-can-do" className="grid gap-8">
          <h2 id="what-you-can-do" className="text-2xl font-semibold tracking-tight">What you can do</h2>
          <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <span className="row-span-2 flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t py-6 text-sm text-muted-foreground">
        <p>Your records are private to your account. AntTipid has no ads and doesn’t sell your data.</p>
        <nav className="flex gap-5">
          <Link to="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">Privacy policy</Link>
          <a href="mailto:anttipid.support@gmail.com" className="underline-offset-4 hover:text-foreground hover:underline">Contact</a>
        </nav>
      </footer>
    </div>
  )
}
