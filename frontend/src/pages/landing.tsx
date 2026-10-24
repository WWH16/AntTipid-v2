// What signed-out visitors see at /: what AntTipid is and does, then sign in. Google's consent-screen review reads this page.
// The hero runs Home's real "left to spend" card on numbers the visitor types; the previews below use sample data.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BatteryFull, ChartColumn, Check, ChartPie, ChevronDown, Download, Gauge, House, ListOrdered, Menu, PiggyBank, Plus, ReceiptText, Signal, Wallet, Wifi } from 'lucide-react'
import { BudgetBadge, BudgetItem } from '@/components/budget'
import { CategoryMedia } from '@/components/category-icon'
import { HeroCard } from '@/components/hero-card'
import { LogoWithTagline } from '@/components/logo'
import { MoneyInput } from '@/components/money-input'
import { ReceiptItems } from '@/components/receipt-items'
import { SafeToSpendCard } from '@/components/safe-to-spend-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLinkItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { budgetPercent, budgetRemaining, budgetState } from '@/lib/budget'
import { money } from '@/lib/format'
import { monthTotals } from '@/lib/report'
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

/** Stagger index for the landing's .rise / .log-in / step animations. */
const stagger = (i: number) => ({ '--i': i }) as CSSProperties

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

// The whole-month budget the category spending adds up to: ₱5,760 of ₱12,000.
const MONTH_BUDGET: BudgetStatus = { id: 'all', categoryId: null, limit: 12000, warnAt: 80, spent: 5760 }

const SAMPLE_RECEIPT = [
  { name: 'Rice, 5 kg', qty: 1, price: 310 },
  { name: 'Eggs, 1 tray', qty: 1, price: 245 },
  { name: 'Cooking oil', qty: 1, price: 135 },
]

// Running total for the first 18 days of a 30-day month, ending at the ₱5,760 spent: the Meralco bill on day 5, groceries
// on day 16. It stays under the on-budget pace, like the "On track" budget.
const PACE_DAYS = 30
const SAMPLE_RUNNING = [180, 420, 610, 760, 2410, 2560, 2790, 3010, 3150, 3380, 3700, 3840, 4060, 4280, 4520, 5210, 5450, 5760]

// Six months of income and spending ending this month; the month in progress has spent less so far.
const SAMPLE_TREND = [[17200, 9850], [17200, 11300], [18500, 10420], [18500, 12960], [18500, 9140], [18500, 5760]]

const SAMPLE_SPENDING = [
  { name: 'Food', amount: 2180 },
  { name: 'Bills', amount: 1650 },
  { name: 'Transport', amount: 1240 },
  { name: 'Groceries', amount: 690 },
]

/** Sets --screen-zoom on a phone screen: its width over the hero screen's full width on a phone (326px), so the app page
    inside keeps one set of proportions however big the phone is drawn. The CSS zooms the page by it. */
function useScreenZoom() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => el.style.setProperty('--screen-zoom', String(el.clientWidth / 326)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return ref
}

const linkClass = 'rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

// Footer links sit on the dark mast: lighten on hover, lime focus ring, a 44px tap row (16px text, 10px above and below).
const footerLink = 'block rounded-sm py-2.5 underline-offset-4 transition-colors hover:text-primary-foreground hover:underline focus-visible:ring-3 focus-visible:ring-sidebar-ring focus-visible:outline-none'

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

  // Start the screen's fill-and-log-in sequence once most of the phone is visible; on phones it starts below the fold.
  const phone = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = phone.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      el.dataset.play = ''
      io.disconnect()
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const screen = useScreenZoom()

  return (
    // md:w-min: beside the copy, the column is as wide as the phone and the line under it wraps to that.
    <div className="grid gap-3 md:w-min">
      {/* iPhone-style frame: thin black bezel, metal rim, Dynamic Island, side buttons. Only the inputs and the card are live. */}
      <div ref={phone} className="phone-land hero-phone relative mx-auto w-full max-w-[21rem] rounded-[3.15rem] bg-black p-[5px] shadow-2xl ring-[1.5px] shadow-primary/25 ring-input">
        <span aria-hidden className="absolute top-[17%] -left-[3px] h-7 w-[3px] rounded-l-sm bg-input" />
        <span aria-hidden className="absolute top-[24%] -left-[3px] h-12 w-[3px] rounded-l-sm bg-input" />
        <span aria-hidden className="absolute top-[33%] -left-[3px] h-12 w-[3px] rounded-l-sm bg-input" />
        <span aria-hidden className="absolute top-[27%] -right-[3px] h-16 w-[3px] rounded-r-sm bg-input" />

        <div ref={screen} className="hero-screen relative grid aspect-[9/19.5] content-start gap-4 overflow-hidden rounded-[2.85rem] bg-background px-4 pb-8">
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
              {/* Newest at the top, so it logs in last. */}
              {SAMPLE_ACTIVITY.map((t, i) => (
                <Item key={t.title} size="xs" className="log-in" style={stagger(SAMPLE_ACTIVITY.length - 1 - i)}>
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
      <p style={stagger(8)} className="rise text-center text-sm text-muted-foreground">Try your own numbers. It uses today’s date and the same math as Home.</p>
    </div>
  )
}

/** One app screen in the preview with its caption. In the pinned tour the screen slides through the phone and the
    caption joins the step list (its node and rail are drawn only there). Without the tour the caption sits above its
    screen: one centred column below lg, three across from lg. */
function PreviewPanel({ step, title, body, headline, description, children }: { step: number; title: string; body: string; headline: string; description?: string; children: ReactNode }) {
  const screen = useScreenZoom()
  return (
    <figure className="mx-auto grid w-full max-w-sm content-start gap-4 lg:max-w-none">
      {/* inert as well as aria-hidden: on narrow screens the receipt table scrolls sideways, and Chrome would make it a Tab stop. */}
      <div ref={screen} aria-hidden inert className="tour-screen pointer-events-none overflow-hidden rounded-3xl bg-background p-4 text-foreground select-none">
        {/* Outer div: scrolls the screen in the tour when its content runs past the phone. Inner: the page. */}
        <div>
          <div className="grid content-start gap-3">
            <div>
              <p className="text-lg leading-tight font-semibold tracking-tight text-balance">{headline}</p>
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            {children}
          </div>
        </div>
      </div>
      <figcaption className="order-first grid gap-1">
        <span aria-hidden className="tour-node hidden">{step}</span>
        <span aria-hidden className="tour-rail hidden" />
        <span className="font-semibold text-primary-foreground">{title}</span>
        <span className="text-sm leading-relaxed text-primary-foreground/70">{body}</span>
      </figcaption>
    </figure>
  )
}

/** A filled-in form field as the app shows it after a scan. */
function FilledField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium">{label}</span>
      <span className="flex h-9 items-center rounded-lg border bg-background px-2.5 text-sm tabular-nums">{value}</span>
    </div>
  )
}

/** Reports' "Spending through the month": the running total so far against the dashed on-budget pace, as plain SVG
    (the real chart is recharts, too heavy for this page). */
function PaceLine() {
  const [w, h] = [300, 120]
  const top = MONTH_BUDGET.limit * 1.08
  const x = (day: number) => ((day - 1) / (PACE_DAYS - 1)) * w
  const y = (v: number) => h - (v / top) * h
  const line = SAMPLE_RUNNING.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(SAMPLE_RUNNING.length).toFixed(1)},${h} L0,${h} Z`
  return (
    <div className="grid gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-28 w-full overflow-visible">
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
        <g className="pace-reveal">
          <path d={area} fill="var(--chart-2)" fillOpacity={0.15} />
          <line x1="0" y1={h} x2={w} y2={y(MONTH_BUDGET.limit)} stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        </g>
        <path d={line} className="pace-line" pathLength={1} fill="none" stroke="var(--chart-2)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">{[1, 10, 20, PACE_DAYS].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="flex justify-center gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-chart-2" />Spent so far</span>
        <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-muted-foreground" />On-budget pace</span>
      </div>
    </div>
  )
}

/** Reports' "Income and spending" chart for six months, drawn as plain bars (the real one is recharts, too heavy for this page). */
function TrendBars() {
  const [months] = useState(() => {
    const now = new Date()
    return SAMPLE_TREND.map((_, k) => new Date(now.getFullYear(), now.getMonth() - 5 + k).toLocaleString('en', { month: 'short' }))
  })
  const top = Math.max(...SAMPLE_TREND.flat())
  return (
    <div className="grid gap-2">
      <div className="trend-bars grid h-28 grid-cols-6 items-end gap-1.5 bg-[repeating-linear-gradient(to_top,var(--border)_0_1px,transparent_1px_25%)]">
        {SAMPLE_TREND.map(([income, spent], k) => (
          <div key={months[k]} className="flex h-full items-end justify-center gap-0.5" style={{ '--k': k } as CSSProperties}>
            <span className="w-2.5 rounded-t-[3px] bg-chart-1" style={{ height: `${(income / top) * 100}%` }} />
            <span className="w-2.5 rounded-t-[3px] bg-chart-2" style={{ height: `${(spent / top) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1.5 text-center text-[11px] text-muted-foreground">{months.map((m) => <span key={m}>{m}</span>)}</div>
      <div className="flex justify-center gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-chart-1" />Income</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-chart-2" />Spending</span>
      </div>
    </div>
  )
}

function SectionHeading({ id, title, body }: { id: string; title: string; body?: string }) {
  return (
    <div className="grid max-w-2xl gap-3">
      <h2 id={id} className="text-section font-semibold tracking-tight text-balance">{title}</h2>
      {body && <p className="leading-relaxed sm:text-lg text-muted-foreground">{body}</p>}
    </div>
  )
}

export function LandingPage() {
  useEffect(() => { document.title = 'AntTipid: expense and budget tracker' }, [])
  // The section picked from the phone menu: when the menu closes, focus moves to that section's heading so Tab carries on from there.
  const jumpTo = useRef<string | null>(null)
  return (
    <div className="min-h-svh overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-2">Skip to content</a>
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
          <Link to="/" aria-label="AntTipid home" className="shrink-0 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <LogoWithTagline height={28} small />
          </Link>
          <nav aria-label="Page sections" className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            {NAV.map((n) => <a key={n.href} href={n.href} className={linkClass}>{n.label}</a>)}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Below sm, Log in moves into the menu so the bar fits a 320px screen. */}
            <Button variant="ghost" className="max-sm:hidden" nativeButton={false} render={<Link to="/sign-in" />}>Log in</Button>
            <Button className="cta-win max-sm:px-3" nativeButton={false} render={<Link to={SIGN_UP} />}>Get started</Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" className="md:hidden" />}>
                <Menu />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44"
                finalFocus={() => {
                  const h = jumpTo.current && document.querySelector<HTMLElement>(`${jumpTo.current} h2`)
                  jumpTo.current = null
                  if (h) h.tabIndex = -1
                  return h || true
                }}
              >
                {NAV.map((n) => (
                  <DropdownMenuLinkItem key={n.href} href={n.href} closeOnClick onClick={() => { jumpTo.current = n.href }}>{n.label}</DropdownMenuLinkItem>
                ))}
                <DropdownMenuSeparator className="sm:hidden" />
                <DropdownMenuLinkItem closeOnClick className="sm:hidden" render={<Link to="/sign-in" />}>Log in</DropdownMenuLinkItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main id="main" className="[&_h2]:outline-none [&_section]:scroll-mt-16">
        {/* Hero */}
        {/* Phones: copy, then the phone. From md: side by side, the phone sized to the first screen (index.css) and the
            heading sized to its column, so it fits any tablet or desktop screen. */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-8 pb-14 sm:gap-12 sm:px-6 sm:pt-12 sm:pb-20 md:grid-cols-[minmax(0,1fr)_auto] md:gap-10 md:pt-10 md:pb-16 lg:gap-16">
          <div className="@container grid gap-5 sm:gap-6">
            <h1 className="rise text-[2.25rem] leading-[1.05] font-bold tracking-[-0.04em] text-balance sm:text-[clamp(2.25rem,12cqi,4.5rem)]">
              <span className="sr-only">AntTipid: </span>Know where every peso goes.
            </h1>
            <p style={stagger(1)} className="rise max-w-[34rem] leading-relaxed sm:text-lg md:text-base lg:text-lg text-muted-foreground">
              <em className="font-medium text-foreground not-italic">Tipid</em> means spending carefully so your money lasts until the
              next sahod. AntTipid is a free tracker that helps: log what you spend and earn across cash, GCash, Maya and your bank,
              set a budget for each category, and see how much is left to spend this month.
            </p>
            <div style={stagger(2)} className="rise flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button size="lg" className="cta-win" nativeButton={false} render={<Link to={SIGN_UP} />}>Start keeping more of your money</Button>
              <Button size="lg" variant="outline" nativeButton={false} render={<a href="#how-it-works" />}>See how it works</Button>
            </div>
            <p style={stagger(3)} className="rise -mt-1 text-sm text-muted-foreground sm:-mt-2">
              Already have an account? <Link to="/sign-in" className="font-medium text-foreground underline underline-offset-4">Log in</Link>
            </p>
            <ul style={stagger(3)} className="rise flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {['Free, no ads', 'Never asks for your bank or GCash login', 'Works on your phone'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-chart-1" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <TryIt />
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="border-y bg-card">
          {/* Compact on phones (tighter padding, gaps and text); the original spacing from sm. */}
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:gap-12 sm:px-6 sm:py-20">
            <SectionHeading
              id="features-title"
              title="Everything you need to stay on budget"
              body="Built around one question: how much can I still spend this month?"
            />
            <ul className="grid gap-x-12 gap-y-5 sm:grid-cols-2 sm:gap-y-10">
              {FEATURES.map(({ icon: Icon, title, body }, i) => (
                <li key={title} style={stagger(i % 2)} className="feature grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <span className="row-span-2 flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="text-item font-semibold">{title}</h3>
                  <p className="max-w-[60ch] text-item-body text-muted-foreground sm:leading-relaxed">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-title" className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:gap-12 sm:px-6 sm:py-20">
          <SectionHeading id="how-title" title="Set up in a few minutes" />
          <ol className="steps grid gap-5 sm:gap-7 md:grid-cols-3 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} style={stagger(i)} className="relative grid grid-cols-[2.5rem_1fr] content-start gap-x-4 gap-y-1 md:grid-cols-1 md:gap-3">
                <span data-step-dot className="row-span-2 flex size-10 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground tabular-nums md:row-span-1" aria-hidden>{i + 1}</span>
                {/* Connector to the next step: down the left on phones, across the top from md. */}
                {i < STEPS.length - 1 && (
                  <span data-step-link aria-hidden className="absolute top-12 -bottom-3 left-5 sm:-bottom-5 w-0.5 -translate-x-1/2 rounded-full bg-primary/15 md:top-5 md:-right-4 md:bottom-auto md:left-14 md:h-0.5 md:w-auto md:translate-x-0 md:-translate-y-1/2">
                    <span className="block size-full rounded-full bg-primary" />
                  </span>
                )}
                <h3 className="text-item font-semibold">{s.title}</h3>
                <p className="text-item-body text-muted-foreground sm:leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Preview */}
        <section id="preview" aria-labelledby="preview-title" className="tour bg-primary canvas-dark text-primary-foreground">
          <div className="tour-stage mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:gap-12 sm:px-6 sm:py-20">
            <div className="grid max-w-2xl gap-3">
              <h2 id="preview-title" className="text-section font-semibold tracking-tight text-balance">A look inside the app</h2>
              <p className="leading-relaxed sm:text-lg text-primary-foreground/70">Sample numbers on the real screens.</p>
            </div>
            <div className="tour-grid grid gap-8 lg:grid-cols-3 lg:gap-6">
              {/* Pinned tour only: the step nodes and rails as a row (phones; from md they sit beside the captions), and
                  the phone the screens slide across. */}
              <div aria-hidden className="tour-progress hidden">
                <span className="tour-node" style={stagger(0)}>1</span>
                <span className="tour-rail" style={stagger(0)} />
                <span className="tour-node" style={stagger(1)}>2</span>
                <span className="tour-rail" style={stagger(1)} />
                <span className="tour-node" style={stagger(2)}>3</span>
              </div>
              <div aria-hidden className="tour-phone hidden">
                {/* Side buttons and status bar, as on the hero's phone; the buttons sit just outside the 5px bezel. */}
                <span className="absolute top-[17%] -left-[8px] h-7 w-[3px] rounded-l-sm bg-input" />
                <span className="absolute top-[24%] -left-[8px] h-12 w-[3px] rounded-l-sm bg-input" />
                <span className="absolute top-[33%] -left-[8px] h-12 w-[3px] rounded-l-sm bg-input" />
                <span className="absolute top-[27%] -right-[8px] h-16 w-[3px] rounded-r-sm bg-input" />
                <span className="flex h-12 items-center text-sm font-semibold tabular-nums">9:41</span>
                <span className="flex h-12 items-center gap-1 [&_svg]:size-3.5"><Signal /><Wifi /><BatteryFull /></span>
                {/* The app's bottom bar on phones: four pages with Add raised in the middle. */}
                <span className="tour-tabbar bg-sidebar canvas-dark text-sidebar-foreground">
                  <span><House />Home</span>
                  <span><ListOrdered />Activity</span>
                  <span data-tab="add"><span className="bg-sidebar-primary text-sidebar-primary-foreground ring-sidebar"><Plus /></span></span>
                  <span data-tab="budgets"><PiggyBank />Budgets</span>
                  <span data-tab="reports"><ChartColumn />Reports</span>
                </span>
              </div>

              <PreviewPanel
                step={1}
                title="Budgets"
                body="Over and near-limit budgets come first, so you know where to slow down."
                headline="2 budgets need a look"
                description="Transport and Bills are near or over the limit this month."
              >
                <HeroCard size="sm">
                  <CardHeader>
                    <CardDescription>Whole month, all spending</CardDescription>
                    <CardTitle className="text-2xl font-semibold tabular-nums">{budgetRemaining(MONTH_BUDGET)}</CardTitle>
                    <CardAction><BudgetBadge state={budgetState(MONTH_BUDGET)} solid /></CardAction>
                  </CardHeader>
                  <CardContent><Progress value={budgetPercent(MONTH_BUDGET)} aria-label="Budget used" /></CardContent>
                  <CardFooter className="text-sm text-muted-foreground tabular-nums">
                    {money(MONTH_BUDGET.spent, { whole: true })} of {money(MONTH_BUDGET.limit, { whole: true })}
                  </CardFooter>
                </HeroCard>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>By category</CardTitle>
                    <CardDescription>Over and near-limit budgets first.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ItemGroup className="gap-1">
                      {SAMPLE_BUDGETS.map(({ b, category }) => <BudgetItem key={b.id} b={b} category={category} />)}
                    </ItemGroup>
                  </CardContent>
                </Card>
              </PreviewPanel>

              <PreviewPanel
                step={2}
                title="Receipt scan"
                body="Snap the receipt. The store, date, items and total are filled in for you to check."
                headline="Add transaction"
                description="Read from your receipt. Check it, then save."
              >
                <Card size="sm" className="relative">
                  <CardHeader>
                    <CardTitle>Puregold</CardTitle>
                    <CardDescription>3 items read</CardDescription>
                    <CardAction><Badge variant="secondary"><ReceiptText aria-hidden />Scanned</Badge></CardAction>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <FilledField label="Amount" value={money(690)} />
                    <div className="grid grid-cols-2 gap-2">
                      <FilledField label="Category" value="Groceries" />
                      <FilledField label="Paid from" value="Cash" />
                    </div>
                    <FilledField label="Description" value="Puregold" />
                    <ReceiptItems items={SAMPLE_RECEIPT} total={690} />
                  </CardContent>
                  <div className="scan-pass" />
                </Card>
              </PreviewPanel>

              <PreviewPanel
                step={3}
                title="Reports"
                body="Earned, spent and saved, spending against your budget’s pace, six months of income and spending, and where it went."
                headline="Food took 38% of your spending"
              >
                <div className="grid grid-cols-3 gap-2">
                  {monthTotals(18500, 5760).map(([label, value, tone]) => (
                    <Card key={label} size="sm">
                      <CardHeader>
                        <CardDescription>{label}</CardDescription>
                        <CardTitle className={`text-sm font-semibold tabular-nums ${tone}`}>{money(value, { whole: true })}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Spending through the month</CardTitle>
                    <CardDescription>Running total against your monthly budget.</CardDescription>
                  </CardHeader>
                  <CardContent><PaceLine /></CardContent>
                </Card>
                <Card size="sm" className="tour-mid">
                  <CardHeader>
                    <CardTitle>Income and spending</CardTitle>
                    <CardDescription>Last 6 months</CardDescription>
                  </CardHeader>
                  <CardContent><TrendBars /></CardContent>
                </Card>
                <Card size="sm" className="tour-late">
                  <CardHeader><CardTitle>Where your money went</CardTitle></CardHeader>
                  <CardContent className="grid gap-3 [&_[data-slot=progress-indicator]]:bg-chart-2">
                    {SAMPLE_SPENDING.map((c) => (
                      <Progress key={c.name} value={Math.round((c.amount / 2180) * 100)}>
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
        <section id="faq" aria-labelledby="faq-title" className="faq mx-auto grid w-full max-w-3xl gap-8 px-4 py-14 sm:gap-10 sm:px-6 sm:py-20">
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
        <section aria-labelledby="cta-title">
          {/* px-8: while .panel-open clips the panel to a card 1rem in from each side, the text keeps 1rem of room inside it. */}
          <div className="panel-open grid justify-items-center gap-5 bg-primary canvas-dark px-8 py-14 text-center text-primary-foreground sm:gap-6 sm:py-20 md:py-28">
            <h2 id="cta-title" className="max-w-2xl text-statement font-semibold tracking-tight text-balance">
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

      {/* A dark mast under the closing panel: the privacy promise and the links, then the wordmark across the
          container, then the legal line. The rule on the footer itself runs edge to edge, so the panel and the mast
          stay two blocks on any screen width (a container-wide rule stopped short of the edges on wide screens). */}
      <footer className="border-t border-primary-foreground/15 bg-primary canvas-dark-flat text-primary-foreground">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-12 pb-8 sm:px-6 md:gap-14 md:pt-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
            <p className="max-w-md text-lg leading-snug text-balance">Your records are private to your account. AntTipid has no ads and doesn’t sell your data.</p>
            {/* -mt-2.5: the links' tap padding sits above their text, so this lifts the first one level with the promise. */}
            <nav aria-label="Footer" className="-mt-2.5 grid grid-cols-2 gap-x-10 text-primary-foreground/70 sm:flex sm:gap-x-12">
              <ul className="grid content-start">
                <li><a href="#features" className={footerLink}>Features</a></li>
                <li><a href="#faq" className={footerLink}>FAQ</a></li>
              </ul>
              <ul className="grid content-start">
                <li><Link to="/terms" className={footerLink}>Terms</Link></li>
                <li><Link to="/privacy" className={footerLink}>Privacy policy</Link></li>
              </ul>
              <a href={`mailto:${CONTACT}`} className={`col-span-2 self-start ${footerLink}`}>{CONTACT}</a>
            </nav>
          </div>
          {/* The wordmark spans the container, but stays under about a third of the screen's height (it is 3.6 times as
              wide as tall), so a short laptop or a wide monitor still sees the whole footer at once. */}
          <div className="grid gap-2">
            <img src="/brand/logo-reversed.svg" alt="AntTipid" className="w-[min(100%,116svh)]" />
            <p className="text-sm font-medium text-sidebar-primary sm:text-base">Expense &amp; budget tracker</p>
          </div>
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-primary-foreground/15 pt-5 text-sm text-primary-foreground/70">
            <p>© {new Date().getFullYear()} AntTipid</p>
            <p>Developed by John Ansley Rocel</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
