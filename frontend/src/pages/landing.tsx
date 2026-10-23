// What signed-out visitors see at /: what AntTipid is and does, then sign in. Google's consent-screen review reads this page.
// The hero runs Home's real "left to spend" card on numbers the visitor types; the previews below use sample data.
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BatteryFull, Check, ChartPie, ChevronDown, Download, Gauge, Menu, PiggyBank, ReceiptText, Signal, Wallet, Wifi } from 'lucide-react'
import { BudgetItem } from '@/components/budget'
import { CategoryMedia } from '@/components/category-icon'
import { LogoWithTagline } from '@/components/logo'
import { MoneyInput } from '@/components/money-input'
import { SafeToSpendCard } from '@/components/safe-to-spend-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { money } from '@/lib/format'
import type { BudgetStatus, Category } from '@/types'

const SIGN_UP = '/sign-in?mode=signup'
const CONTACT = 'anttipid.support@gmail.com'

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#preview', label: 'Preview' },
  { href: '#faq', label: 'FAQ' },
]

const FEATURES = [
  { icon: Wallet, title: 'Every wallet in one place', body: 'Cash, GCash, Maya, bank accounts and cards each keep their own balance. Move money between them with a transfer.' },
  { icon: Gauge, title: 'Left to spend, at a glance', body: 'Home shows what’s left of this month’s budget, whether you’re ahead of the month, and how much a day keeps you on track.' },
  { icon: PiggyBank, title: 'Budgets by category', body: 'Set a monthly limit for food, transport or bills. Budgets near the limit or over it rise to the top so you see them first.' },
  { icon: ReceiptText, title: 'Scan a receipt', body: 'Take a photo and AntTipid fills in the store, date, items and total. You check it, then save.' },
  { icon: ChartPie, title: 'Reports that add up', body: 'See what you earned, spent and saved, where the money went by category, and six months of income against spending.' },
  { icon: Download, title: 'Search and export', body: 'Find any transaction by month, wallet, category or name, and download the month as a CSV for your own spreadsheet.' },
]

const STEPS = [
  { title: 'Create your free account', body: 'Sign up with your email or continue with Google. Common categories like food, transport and bills are ready for you.' },
  { title: 'Add wallets and budgets', body: 'Add the wallets you use and their current balances, then set a budget for the month and for the categories you want to watch.' },
  { title: 'Log as you go', body: 'Type an amount and pick a category, or scan the receipt. Home updates what’s left to spend right away.' },
]

const FAQ = [
  { q: 'Is AntTipid free?', a: 'Yes. AntTipid is free to use, with no ads.' },
  { q: 'Does it connect to my bank, GCash or Maya?', a: 'No. AntTipid never asks for your bank or e-wallet login. You add transactions yourself or scan a receipt, and you set the starting balance of each wallet.' },
  { q: 'Who can see my records?', a: 'Only you. Your records are private to your account, and AntTipid has no analytics or tracking tools and never sells your information.' },
  { q: 'What happens to a receipt photo when I scan it?', a: 'The photo is sent to an AI service that reads the store, date, items and total. AntTipid keeps only what you choose to save. Avoid scanning receipts that show information you’d rather not share.' },
  { q: 'Can I use it on my phone?', a: 'Yes. AntTipid works in your phone’s browser, and you can add it to your home screen so it opens like an app.' },
  { q: 'Can I get my data out or delete it?', a: `Download any month of transactions as a CSV from Activity. To delete your account and everything in it, email ${CONTACT} from the address you sign in with.` },
]

// Preview sample month: ₱5,760 spent, ₱18,500 earned. Category budgets show all three states.
const cat = (name: string): Category => ({ id: name.toLowerCase(), name, icon: name.toLowerCase(), kind: 'expense' })

const SAMPLE_BUDGETS: { b: BudgetStatus; category: Category }[] = [
  { b: { id: 't', categoryId: 'transport', limit: 1200, warnAt: 80, spent: 1240 }, category: cat('Transport') },
  { b: { id: 'b', categoryId: 'bills', limit: 2000, warnAt: 80, spent: 1650 }, category: cat('Bills') },
  { b: { id: 'f', categoryId: 'food', limit: 3000, warnAt: 80, spent: 2180 }, category: cat('Food') },
]

// Under the live card, so the phone screen reads as Home: recent activity, cut off by the screen edge like a list you'd scroll.
const SAMPLE_ACTIVITY = [
  { title: 'Lunch at the carinderia', where: 'Food, Cash', amount: 95, category: cat('Food') },
  { title: 'Grab to work', where: 'Transport, GCash', amount: 245, category: cat('Transport') },
  { title: 'Meralco bill', where: 'Bills, Bank account', amount: 1650, category: cat('Bills') },
]

const SAMPLE_SPENDING = [
  { name: 'Food', amount: 2180 },
  { name: 'Bills', amount: 1650 },
  { name: 'Transport', amount: 1240 },
  { name: 'Groceries', amount: 690 },
]

const linkClass = 'rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

/** Home's "left to spend" card, live on the visitor's own numbers and today's date. */
function TryIt() {
  const [today] = useState(() => {
    const now = new Date()
    return { dayOfMonth: now.getDate(), daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() }
  })
  const [budget, setBudget] = useState('12000')
  // Sample spending sits a little under the on-budget pace for today, so the first thing a visitor sees is "On track" on any day of the month.
  const [spent, setSpent] = useState(() => String(Math.round((12000 * today.dayOfMonth / today.daysInMonth) * 0.8 / 10) * 10))
  const s = { budget: Number(budget) || 0, spent: Number(spent) || 0, ...today }
  const left = s.budget - s.spent

  return (
    <div className="grid gap-3">
      {/* iPhone-style frame: thin black bezel, metal rim, Dynamic Island, side buttons. Only the inputs and the card are live. */}
      <div className="relative mx-auto w-full max-w-[21rem] rounded-[3.25rem] bg-black p-[7px] shadow-2xl ring-[1.5px] shadow-primary/25 ring-input">
        <span aria-hidden className="absolute top-[17%] -left-[3px] h-7 w-[3px] rounded-l-sm bg-input" />
        <span aria-hidden className="absolute top-[24%] -left-[3px] h-12 w-[3px] rounded-l-sm bg-input" />
        <span aria-hidden className="absolute top-[33%] -left-[3px] h-12 w-[3px] rounded-l-sm bg-input" />
        <span aria-hidden className="absolute top-[27%] -right-[3px] h-16 w-[3px] rounded-r-sm bg-input" />

        <div className="relative grid aspect-[9/19.5] content-start gap-4 overflow-hidden rounded-[2.85rem] bg-background px-4 pb-8">
          <div aria-hidden className="grid h-12 grid-cols-[1fr_auto_1fr] items-center px-3 text-foreground select-none">
            <span className="text-sm font-semibold tabular-nums">9:41</span>
            <span className="h-[1.6rem] w-[5.5rem] rounded-full bg-black" />
            <span className="flex items-center justify-end gap-1 [&_svg]:size-3.5"><Signal /><Wifi /><BatteryFull /></span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="try-budget">Monthly budget</Label>
              <MoneyInput id="try-budget" value={budget} onChange={setBudget} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="try-spent">Spent so far</Label>
              <MoneyInput id="try-spent" value={spent} onChange={setSpent} />
            </div>
          </div>
          {s.budget > 0
            ? <SafeToSpendCard s={s} />
            : <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">Type a monthly budget to see what’s left to spend.</p>}
          <p className="sr-only" aria-live="polite">
            {s.budget > 0 && (left >= 0 ? `${money(left, { whole: true })} left to spend this month` : `${money(-left, { whole: true })} over budget`)}
          </p>
          <div aria-hidden className="grid gap-1 select-none">
            <p className="px-1 text-sm font-semibold">Recent activity</p>
            <ItemGroup className="gap-1">
              {SAMPLE_ACTIVITY.map((t) => (
                <Item key={t.title} size="xs">
                  <CategoryMedia category={t.category} />
                  <ItemContent>
                    <ItemTitle>{t.title}</ItemTitle>
                    <ItemDescription>{t.where}</ItemDescription>
                  </ItemContent>
                  <ItemActions className="font-medium tabular-nums">-{money(t.amount)}</ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </div>
          <span aria-hidden className="absolute bottom-2 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-foreground/80" />
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground">Try your own numbers. It uses today’s date and the same math as Home.</p>
    </div>
  )
}

function PreviewPanel({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <figure className="grid content-start gap-4">
      <div aria-hidden className="pointer-events-none select-none">{children}</div>
      <figcaption className="grid gap-1">
        <span className="font-semibold text-primary-foreground">{title}</span>
        <span className="text-sm leading-relaxed text-primary-foreground/70">{body}</span>
      </figcaption>
    </figure>
  )
}

function SectionHeading({ id, title, body }: { id: string; title: string; body?: string }) {
  return (
    <div className="grid max-w-2xl gap-3">
      <h2 id={id} className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl md:text-4xl">{title}</h2>
      {body && <p className="leading-relaxed sm:text-lg text-muted-foreground">{body}</p>}
    </div>
  )
}

export function LandingPage() {
  useEffect(() => { document.title = 'AntTipid: expense and budget tracker' }, [])
  return (
    <div className="min-h-svh overflow-x-clip">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
          <Link to="/" aria-label="AntTipid home" className="shrink-0 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <LogoWithTagline height={28} small />
          </Link>
          <nav aria-label="Page sections" className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            {NAV.map((n) => <a key={n.href} href={n.href} className={linkClass}>{n.label}</a>)}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" className="max-sm:px-2" nativeButton={false} render={<Link to="/sign-in" />}>Log in</Button>
            <Button className="cta-win max-sm:px-3" nativeButton={false} render={<Link to={SIGN_UP} />}>Get started</Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Jump to a section" className="md:hidden" />}>
                <Menu />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {NAV.map((n) => (
                  <DropdownMenuItem key={n.href} onClick={() => document.querySelector(n.href)?.scrollIntoView()}>{n.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="[&_section]:scroll-mt-16">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-8 pb-14 sm:gap-12 sm:px-6 sm:pt-12 sm:pb-20 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="grid gap-5 sm:gap-6">
            <h1 className="text-[2.25rem] leading-[1.05] font-bold tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
              <span className="sr-only">AntTipid: </span>Know where every peso goes.
            </h1>
            <p className="max-w-[34rem] leading-relaxed sm:text-lg text-muted-foreground">
              <em className="font-medium text-foreground not-italic">Tipid</em> means spending carefully so your money lasts until the
              next sahod. AntTipid is a free tracker that helps: log what you spend and earn across cash, GCash, Maya and your bank,
              set a budget for each category, and see how much is left to spend this month.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="cta-win" nativeButton={false} render={<Link to={SIGN_UP} />}>Start keeping more of your money</Button>
              <Button size="lg" variant="outline" nativeButton={false} render={<a href="#how-it-works" />}>See how it works</Button>
            </div>
            <p className="-mt-1 text-sm text-muted-foreground sm:-mt-2">
              Already have an account? <Link to="/sign-in" className="font-medium text-foreground underline underline-offset-4">Log in</Link>
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {['Free, no ads', 'Never asks for your bank or GCash login', 'Works on your phone'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-chart-1" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <TryIt />
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="border-y bg-card">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:gap-12 sm:px-6 sm:py-20">
            <SectionHeading
              id="features-title"
              title="Everything you need to stay on budget"
              body="Built around one question: how much can I still spend this month?"
            />
            <ul className="grid gap-x-12 gap-y-7 sm:grid-cols-2 sm:gap-y-10">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <span className="row-span-2 flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="max-w-[60ch] leading-relaxed text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-title" className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:gap-12 sm:px-6 sm:py-20">
          <SectionHeading id="how-title" title="Set up in a few minutes" />
          <ol className="grid gap-7 md:grid-cols-3 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid content-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground tabular-nums" aria-hidden>{i + 1}</span>
                <h3 className="font-semibold sm:text-lg">{s.title}</h3>
                <p className="leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Preview */}
        <section id="preview" aria-labelledby="preview-title" className="bg-primary canvas-dark text-primary-foreground">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:gap-12 sm:px-6 sm:py-20">
            <div className="grid max-w-2xl gap-3">
              <h2 id="preview-title" className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl md:text-4xl">A look inside the app</h2>
              <p className="leading-relaxed sm:text-lg text-primary-foreground/70">Sample numbers on the real screens.</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3 md:gap-6">
              <PreviewPanel title="Budgets" body="Over and near-limit budgets come first, so you know where to slow down.">
                <Card size="sm">
                  <CardContent>
                    <ItemGroup className="gap-1">
                      {SAMPLE_BUDGETS.map(({ b, category }) => <BudgetItem key={b.id} b={b} category={category} />)}
                    </ItemGroup>
                  </CardContent>
                </Card>
              </PreviewPanel>

              <PreviewPanel title="Receipt scan" body="Snap the receipt. The store, date, items and total are filled in for you to check.">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Puregold</CardTitle>
                    <CardDescription>October 21, Groceries</CardDescription>
                    <CardAction><Badge variant="secondary"><ReceiptText aria-hidden />Scanned</Badge></CardAction>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    {[['Rice, 5 kg', 310], ['Eggs, 1 tray', 245], ['Cooking oil', 135]].map(([name, price]) => (
                      <div key={name} className="flex justify-between gap-4"><span>{name}</span><span className="tabular-nums">{money(price as number)}</span></div>
                    ))}
                  </CardContent>
                  <CardFooter className="justify-between font-semibold"><span>Total</span><span className="tabular-nums">{money(690)}</span></CardFooter>
                </Card>
              </PreviewPanel>

              <PreviewPanel title="Reports" body="Earned, spent and saved for the month, and where the spending went.">
                <Card size="sm">
                  <CardHeader className="grid-cols-3 gap-2 text-center">
                    {[['Earned', 18500], ['Spent', 5760], ['Saved', 12740]].map(([label, n]) => (
                      <div key={label} className="grid gap-0.5">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="text-sm font-semibold tabular-nums">{money(n as number, { whole: true })}</span>
                      </div>
                    ))}
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {SAMPLE_SPENDING.map((c) => (
                      <Progress key={c.name} value={Math.round((c.amount / 5760) * 100)}>
                        <ProgressLabel>{c.name}</ProgressLabel>
                        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{money(c.amount, { whole: true })}</span>
                      </Progress>
                    ))}
                  </CardContent>
                </Card>
              </PreviewPanel>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-14 sm:gap-10 sm:px-6 sm:py-20">
          <SectionHeading id="faq-title" title="Questions, answered" />
          <div className="grid gap-3">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group rounded-lg border bg-card">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-4 py-3 font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
                </summary>
                <p className="px-4 pb-4 leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="cta-title" className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
          <div className="grid justify-items-center gap-5 rounded-3xl bg-primary canvas-dark px-5 py-10 text-center text-primary-foreground sm:gap-6 sm:px-6 sm:py-14 md:py-20">
            <h2 id="cta-title" className="max-w-xl text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl md:text-4xl">
              Make every sahod last the whole month.
            </h2>
            <p className="max-w-md text-primary-foreground/70">Free, private to your account, and it never asks for your bank login. Set up on your phone in a few minutes.</p>
            <Button
              size="lg"
              nativeButton={false}
              render={<Link to={SIGN_UP} />}
              className="cta-win cta-win-dark"
            >
              Start keeping more of your money
            </Button>
            <p className="text-sm text-primary-foreground/70">
              Already have one? <Link to="/sign-in" className="font-medium text-primary-foreground underline underline-offset-4">Log in</Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm text-muted-foreground sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-4">
            <LogoWithTagline height={34} small />
            <p className="max-w-md">Your records are private to your account. AntTipid has no ads and doesn’t sell your data.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <a href="#features" className={linkClass}>Features</a>
            <a href="#faq" className={linkClass}>FAQ</a>
            <Link to="/terms" className={linkClass}>Terms</Link>
            <Link to="/privacy" className={linkClass}>Privacy policy</Link>
            <a href={`mailto:${CONTACT}`} className={linkClass}>{CONTACT}</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
