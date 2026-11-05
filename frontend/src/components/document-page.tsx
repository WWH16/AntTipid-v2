// The Help documents (PRD and TRD) in a viewer: a side section to move around, a paper sheet like the print report, and
// a copy button for the course template in Word. Opens outside the app shell. The sheet is always white, so a manual
// select-all stays clean too.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link, NavLink } from 'react-router-dom'
import { ArrowLeft, ClipboardCopy, TableOfContents } from 'lucide-react'
import { toast } from 'sonner'
import { ResponsivePanel } from '@/components/responsive-panel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useOrigin } from '@/hooks/use-origin'
import { cn } from '@/lib/utils'
import { version } from '../../package.json'

const UPDATED = 'November 5, 2026'
const WORD_IMAGE_WIDTH = 600 // fits the text width of a Letter or A4 page with 1-inch margins
const ZOOM_MAX = 4 // times the fitted size
const ZOOM_STEP = 2

const DOCUMENTS = [
  { to: '/help/prd', short: 'PRD', name: 'Product Requirement Document' },
  { to: '/help/trd', short: 'TRD', name: 'Technical Requirement Document' },
]

// The bar and the page share these columns, so Back sits over the side section and the rest over the sheet.
const FRAME = 'mx-auto max-w-[calc(210mm+2rem)] lg:grid lg:max-w-[calc(16rem+2rem+210mm+2rem)] lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8 lg:px-4'

type Section = { id: string; title: string; body: ReactNode }

const SHEET = [
  'leading-[1.55] text-pretty',
  '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-20 [&_h2]:text-xl [&_h2]:leading-tight [&_h2]:font-semibold [&_h2]:break-after-avoid',
  '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:leading-snug [&_h3]:font-semibold [&_h3]:break-after-avoid',
  '[&_section_p]:mt-3 [&_section_ul]:mt-3 [&_section_ul]:list-disc [&_section_ul]:pl-5 [&_section_ol]:mt-3 [&_section_ol]:list-decimal [&_section_ol]:pl-5 [&_section_li]:mt-1',
  '[&_section_p]:max-w-[65ch] [&_section_ul]:max-w-[65ch] [&_section_ol]:max-w-[65ch]',
  '[&_figure]:break-inside-avoid [&_tr]:break-inside-avoid',
  '[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:leading-normal',
  '[&_td]:border [&_td]:px-2 [&_td]:py-1.5 [&_td]:text-left [&_td]:align-top',
  '[&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold',
  '[&_code]:font-mono [&_code]:text-[0.875em] [&_code]:[overflow-wrap:anywhere]',
].join(' ')

/** The document as bare HTML, so Word applies the template's own fonts and sizes instead of this page's. */
function wordHtml(article: HTMLElement) {
  const copy = article.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'))
  copy.querySelectorAll('table').forEach((table) => table.setAttribute('border', '1'))
  // Word fetches each image itself, so it needs the full address, and these PNGs are 2x, so it needs the size too.
  copy.querySelectorAll('img').forEach((img) => {
    const scale = WORD_IMAGE_WIDTH / Number(img.getAttribute('width'))
    img.setAttribute('src', img.src)
    img.setAttribute('height', String(Math.round(Number(img.getAttribute('height')) * scale)))
    img.setAttribute('width', String(WORD_IMAGE_WIDTH))
  })
  return copy.innerHTML
}

/** Through the copy event, not navigator.clipboard: that one sanitizes and rewrites the HTML. */
function copyHtml(html: string, text: string) {
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/html', html)
    e.clipboardData?.setData('text/plain', text)
    e.preventDefault()
  }
  document.addEventListener('copy', onCopy, { once: true })
  const copied = document.execCommand('copy')
  document.removeEventListener('copy', onCopy)
  return copied
}

/**
 * The section being read: the last heading past the line, or the last section once the page can't scroll further.
 * ponytail: at the very end, picking the second-last section still marks the last. Follow the hash there if it matters.
 */
function useCurrentSection(sections: Section[]) {
  const [current, setCurrent] = useState(sections[0].id)
  useEffect(() => {
    const update = () => {
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 1
      const passed = sections.findLast((s) => document.getElementById(s.id)!.getBoundingClientRect().top <= 120) // the line just under the bar
      setCurrent((atEnd ? sections.at(-1) : passed)?.id ?? sections[0].id)
    }
    update()
    addEventListener('scroll', update, { passive: true })
    return () => removeEventListener('scroll', update)
  }, [sections])
  return current
}

/** The side section: which document, then where in it. A rail from lg, a panel below. */
function DocumentNav({ sections, current, origin, onPick }: {
  sections: Section[]
  current: string
  origin: ReturnType<typeof useOrigin>
  onPick?: (e: MouseEvent, id: string) => void // set in the panel
}) {
  return (
    <div className="grid gap-3 text-sm">
      <nav aria-label="Documents" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-center">
        {DOCUMENTS.map((d) => (
          // In the panel, replace the panel's own history entry so Back doesn't stop on it.
          <NavLink key={d.to} to={d.to} state={origin} replace={!!onPick} className="rounded-md py-1 hover:bg-card aria-[current=page]:bg-card aria-[current=page]:font-medium pointer-coarse:py-3">
            {d.short}<span className="sr-only">, {d.name}</span>
          </NavLink>
        ))}
      </nav>
      <nav aria-label="Contents" className="grid gap-1">
        {!onPick && <p className="px-2 font-medium">Contents</p>}
        <ol>
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={s.id === current ? 'location' : undefined}
                onClick={onPick && ((e) => onPick(e, s.id))}
                // Colour only: a heavier weight would wrap the longer titles and shift the list as you read.
                className="flex gap-2 rounded-md px-2 py-1 hover:bg-muted aria-[current=location]:bg-secondary aria-[current=location]:text-secondary-foreground pointer-coarse:py-3"
              >
                <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}

export function DocumentPage({ title, sections }: { title: string; sections: Section[] }) {
  const article = useRef<HTMLElement>(null)
  useEffect(() => { document.title = `${title} | AntTipid` }, [title])
  const origin = useOrigin()
  const current = useCurrentSection(sections)

  const [panelOpen, setPanelOpen] = useState(false)
  // A pick replaces the panel's history entry, then jumps once the panel's scroll lock has let go of the page.
  function pick(e: MouseEvent, id: string) {
    e.preventDefault()
    location.replace(`#${id}`)
    flushSync(() => setPanelOpen(false))
    document.getElementById(id)?.scrollIntoView()
  }

  function copy() {
    const el = article.current
    if (!el) return
    if (copyHtml(wordHtml(el), el.innerText)) toast('Copied. Paste it into Word.')
    else toast.error('Couldn’t copy here. Select the page and copy it by hand.')
  }

  return (
    <div className="min-h-svh bg-background print:bg-transparent">
      <a href={`#${sections[0].id}`} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-2">Skip to content</a>
      <div className="sticky top-0 z-10 bg-background print:hidden">
        <div className={cn(FRAME, 'flex items-center gap-2 px-4 py-2')}>
          <div className="flex gap-2">
            <Button variant="outline" nativeButton={false} render={<Link to={origin.from ?? '/'} />}><ArrowLeft /> Back to app</Button>
            <Button variant="outline" className="lg:hidden" onClick={() => setPanelOpen(true)}><TableOfContents /><span className="max-sm:sr-only">Contents</span></Button>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <p className="hidden truncate text-sm font-medium sm:block">{title}</p>
            <Button className="ml-auto" onClick={copy}><ClipboardCopy /> <span>Copy<span className="max-[359px]:sr-only"> for Word</span></span></Button>
          </div>
        </div>
      </div>

      <div className={FRAME}>
        <aside className="hidden lg:block print:hidden">
          <Card size="sm" className="sticky top-13 max-h-[calc(100svh-4rem)] overflow-y-auto px-2">
            <DocumentNav sections={sections} current={current} origin={origin} />
          </Card>
        </aside>

        <main className="min-w-0 sm:px-4 sm:pb-4 lg:px-0 print:p-0">
          <article ref={article} className={cn(SHEET, 'mx-auto max-w-[210mm] bg-card p-4 text-foreground sm:p-10 sm:shadow print:max-w-none print:p-0 print:shadow-none')}>
            <header className="border-b pb-4">
              <p className="font-semibold">AntTipid</p>
              <h1 className="mt-1 text-2xl leading-tight font-semibold sm:text-3xl">{title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Version {version}. Prepared by John Ansley Rocel for MIT 202, Advanced Organization of Databases. Updated {UPDATED}.
              </p>
            </header>

            {sections.map((s, i) => (
              <section key={s.id}>
                <h2 id={s.id}>{i + 1}. {s.title}</h2>
                {s.body}
              </section>
            ))}
          </article>
        </main>
      </div>

      {panelOpen && (
        <ResponsivePanel title="Contents" description={title} onClose={() => setPanelOpen(false)}>
          <DocumentNav sections={sections} current={current} origin={origin} onPick={pick} />
        </ResponsivePanel>
      )}
    </div>
  )
}

export function DocTable({ head, rows, nowrapFirst }: { head: string[]; rows: ReactNode[][]; nowrapFirst?: boolean }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table>
        <thead>
          <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => <td key={c} className={cn(nowrapFirst && c === 0 && 'whitespace-nowrap')}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * An open figure: only the picture, fitted to the screen. A click, tap or Enter zooms in, then back to fit from the top
 * zoom. Ctrl + wheel and a trackpad pinch zoom too, and it scrolls to move around. Mounts on each open, so it always
 * starts fitted.
 */
function FigureViewer({ src, width, height, alt }: {
  src: string
  width: number
  height: number
  alt: string
}) {
  const view = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const [scale, setScale] = useState(1)

  // Keeps the spot under the pointer, or the middle of the view, where it is.
  function zoom(factor: number, at?: { clientX: number; clientY: number }) {
    const box = view.current!.getBoundingClientRect()
    const x = at?.clientX ?? box.left + box.width / 2
    const y = at?.clientY ?? box.top + box.height / 2
    const before = image.current!.getBoundingClientRect()
    flushSync(() => setScale((s) => Math.min(ZOOM_MAX, Math.max(1, s * factor))))
    const after = image.current!.getBoundingClientRect()
    const growth = after.width / before.width
    view.current!.scrollLeft += after.left + (x - before.left) * growth - x
    view.current!.scrollTop += after.top + (y - before.top) * growth - y
  }

  // Not React's onWheel: that one is passive, so it can't stop the browser zooming the whole page.
  useEffect(() => {
    const el = view.current!
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return // a plain wheel scrolls
      e.preventDefault()
      zoom(Math.exp(-e.deltaY * 0.004), e)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  return (
    <div ref={view} className="max-h-[calc(100svh-2rem)] max-w-[calc(100svw-2rem)] overflow-auto">
      <button
        type="button"
        // A key press has no pointer position (detail 0), so it zooms from the middle.
        onClick={(e) => (scale < ZOOM_MAX ? zoom(ZOOM_STEP, e.detail ? e : undefined) : setScale(1))}
        className={cn('block focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring/50', scale < ZOOM_MAX ? 'cursor-zoom-in' : 'cursor-zoom-out')}
      >
        <img
          ref={image}
          src={src}
          width={width}
          height={height}
          alt={alt}
          // Fits both ways, no wider than the PNG's own pixels (they are 2x), then scales from there.
          style={{ width: `calc(min(100svw - 2rem, (100svh - 2rem) * ${width / height}, ${width * 2}px) * ${scale})` }}
          className="max-w-none"
        />
      </button>
    </div>
  )
}

/**
 * Keeps its readable width on phones and scrolls sideways there, instead of shrinking the labels to nothing.
 * Opens in a viewer on click. The dialog sits in a portal, outside the sheet, so Copy for Word never sees it.
 */
export function Figure({ n, name, width, height, alt, caption }: {
  n: number
  name: string // public/help/{name}.png, drawn from docs/figures/{name}.html
  width: number
  height: number
  alt: string
  caption: string
}) {
  const src = `/help/${name}.png`
  return (
    <figure className="mt-4">
      <Dialog>
        <div className="overflow-x-auto">
          <DialogTrigger nativeButton={false} render={<img src={src} width={width} height={height} alt={alt} className="h-auto w-full min-w-[36rem] cursor-zoom-in focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring/50 print:min-w-0" />} />
        </div>
        <DialogContent className="w-max max-w-none overflow-hidden p-0 sm:max-w-none">
          <DialogTitle className="sr-only">Figure {n}. {caption}</DialogTitle>
          <FigureViewer src={src} width={width} height={height} alt={alt} />
        </DialogContent>
      </Dialog>
      <figcaption className="mt-2 text-sm text-muted-foreground">Figure {n}. {caption}</figcaption>
    </figure>
  )
}
