// The Help documents (PRD and TRD): a paper sheet like the print report, a contents list, and a copy button for the
// course template in Word. Opens outside the app shell, always on white, so a manual select-all stays clean too.
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useOrigin } from '@/hooks/use-origin'
import { cn } from '@/lib/utils'
import { version } from '../../package.json'

const UPDATED = 'November 5, 2026'
const WORD_IMAGE_WIDTH = 600 // fits the text width of a Letter or A4 page with 1-inch margins

const SHEET = [
  'leading-[1.55]',
  '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-20 [&_h2]:text-xl [&_h2]:leading-tight [&_h2]:font-semibold',
  '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:leading-snug [&_h3]:font-semibold',
  '[&_section_p]:mt-3 [&_section_ul]:mt-3 [&_section_ul]:list-disc [&_section_ul]:pl-5 [&_section_ol]:mt-3 [&_section_ol]:list-decimal [&_section_ol]:pl-5 [&_section_li]:mt-1',
  '[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:leading-normal',
  '[&_td]:border [&_td]:border-neutral-300 [&_td]:px-2 [&_td]:py-1.5 [&_td]:text-left [&_td]:align-top',
  '[&_th]:border [&_th]:border-neutral-300 [&_th]:bg-neutral-100 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold',
  '[&_code]:font-mono [&_code]:text-[0.875em] [&_code]:[overflow-wrap:anywhere]',
].join(' ')

/** The document as bare HTML, so Word applies the template's own fonts and sizes instead of this page's. */
function wordHtml(article: HTMLElement) {
  const copy = article.cloneNode(true) as HTMLElement
  copy.querySelector('nav')?.remove()
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

export function DocumentPage({ title, sections }: {
  title: string
  sections: { id: string; title: string; body: ReactNode }[]
}) {
  const article = useRef<HTMLElement>(null)
  useEffect(() => { document.title = `${title} | AntTipid` }, [title])
  const from = useOrigin()

  function copy() {
    const el = article.current
    if (!el) return
    if (copyHtml(wordHtml(el), el.innerText)) toast('Copied. Paste it into Word.')
    else toast.error('Couldn’t copy here. Select the page and copy it by hand.')
  }

  return (
    <div className="min-h-svh bg-neutral-100 print:bg-white">
      <div className="sticky top-0 z-10 bg-neutral-100 print:hidden">
        <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-3 px-4 py-2 sm:px-0">
          <Button variant="outline" nativeButton={false} render={<Link to={from ?? '/'} />}><ArrowLeft /> Back to app</Button>
          <Button onClick={copy}><ClipboardCopy /> Copy for Word</Button>
        </div>
      </div>

      <div className="sm:px-4 sm:pb-4 print:p-0">
        <article ref={article} className={cn(SHEET, 'relative mx-auto max-w-[210mm] bg-white p-4 text-black sm:p-10 sm:shadow print:max-w-none print:p-0 print:shadow-none')}>
          <header className="border-b border-neutral-300 pb-4">
            <p className="font-semibold">AntTipid</p>
            <h1 className="mt-1 text-2xl leading-tight font-semibold sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm text-neutral-600">
              Version {version}. Prepared by John Ansley Rocel for MIT 202, Advanced Organization of Databases. Updated {UPDATED}.
            </p>
          </header>

          {/* Wide screens have room beside the sheet, where it stays in view. Narrower: above the first section. */}
          <nav aria-label="Contents" className="mt-6 border-b border-neutral-300 pb-4 print:hidden min-[1400px]:absolute min-[1400px]:top-0 min-[1400px]:right-full min-[1400px]:mt-0 min-[1400px]:mr-8 min-[1400px]:h-full min-[1400px]:w-60 min-[1400px]:border-0 min-[1400px]:pb-0">
            <div className="min-[1400px]:sticky min-[1400px]:top-16">
              <p className="font-semibold">Contents</p>
              <ol className="mt-2 list-decimal pl-5 text-sm">
                {sections.map((s) => (
                  <li key={s.id} className="mt-1"><a href={`#${s.id}`} className="underline underline-offset-4 hover:text-primary">{s.title}</a></li>
                ))}
              </ol>
            </div>
          </nav>

          {sections.map((s, i) => (
            <section key={s.id}>
              <h2 id={s.id}>{i + 1}. {s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>
      </div>
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

/** Keeps its readable width on phones and scrolls sideways there, instead of shrinking the labels to nothing. */
export function Figure({ n, name, width, height, alt, caption }: {
  n: number
  name: string // public/help/{name}.png, drawn from docs/figures/{name}.html
  width: number
  height: number
  alt: string
  caption: string
}) {
  return (
    <figure className="mt-4">
      <div className="overflow-x-auto">
        <img src={`/help/${name}.png`} width={width} height={height} alt={alt} className="h-auto w-full min-w-[36rem] print:min-w-0" />
      </div>
      <figcaption className="mt-2 text-sm text-neutral-600">Figure {n}. {caption}</figcaption>
    </figure>
  )
}
