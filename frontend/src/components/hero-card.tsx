import { useId, useRef, type ComponentProps, type MouseEvent } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Whether the pointer is on the ant: its box on screen, padded 8px so a small, moving target is easy to land on. */
function hitsAnt(walker: HTMLElement | null, e: MouseEvent) {
  const r = walker?.firstElementChild?.getBoundingClientRect()
  return !!r && e.clientX > r.left - 8 && e.clientX < r.right + 8 && e.clientY > r.top - 8 && e.clientY < r.bottom + 8
}

/**
 * The one dark-green card per page (Home "left to spend", Budgets "whole month").
 * Same forest + lime pairing as the sidebar; child slots are re-toned for the dark surface.
 * The logo's peso coin sits oversized in the bottom corner, cropped by the card, and an ant walks
 * upside down along the top edge: faint lime halftone marks of the brand's own world, not a stock gradient.
 */
export function HeroCard({ className, children, ...props }: ComponentProps<typeof Card>) {
  const id = useId().replace(/[^\w-]/g, '')
  const walker = useRef<HTMLDivElement>(null)
  const bolting = useRef(false)

  // The ant sits under the card's content, so the card listens and checks whether the pointer is on it.
  // Hover (mouse only): it stops mid-stride and its feelers tap fast, sniffing the cursor; it walks on once the cursor leaves.
  // Click or tap: it startles and bolts, every part sped up together (so walk, turn and gait stay in step), easing
  // back to a walk over 1.4s. Reduced motion: no animations, so both are no-ops.
  function sniff(on: boolean) {
    if (!walker.current || bolting.current) return
    for (const a of walker.current.getAnimations({ subtree: true })) {
      if ((a as CSSAnimation).animationName === 'ant-feel') a.playbackRate = on ? 3 : 1
      else if (on) a.pause()
      else a.play()
    }
  }
  function bolt() {
    if (!walker.current || bolting.current) return
    sniff(false)
    bolting.current = true
    const anims = walker.current.getAnimations({ subtree: true })
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / 1400, 1)
      for (const a of anims) a.playbackRate = 1 + 7 * (1 - p) ** 2
      if (p < 1) requestAnimationFrame(tick)
      else bolting.current = false
    }
    requestAnimationFrame(tick)
  }

  return (
    <Card
      className={cn(
        'relative isolate bg-primary canvas-dark-flat text-primary-foreground ring-0',
        '[&_.text-muted-foreground]:text-primary-foreground/70 [&_[data-slot=card-description]]:text-primary-foreground/70',
        '[&_[data-slot=progress-track]]:bg-primary-foreground/15 [&_[data-slot=progress-indicator]]:bg-sidebar-primary',
        '[&_[data-slot=card-footer]]:border-primary-foreground/15 [&_[data-slot=card-footer]]:bg-transparent',
        '[&_[data-slot=skeleton]]:bg-primary-foreground/15',
        className,
      )}
      onPointerMove={(e) => e.pointerType === 'mouse' && sniff(hitsAnt(walker.current, e))}
      onPointerLeave={() => sniff(false)}
      onClick={(e) => hitsAnt(walker.current, e) && bolt()}
      {...props}
    >
      {children}
      {/* Both marks are a fine pixel print: shapes filled with a grid of tiny diamonds, lines drawn as rows of dots. Ids are per card,
          since several cards can be on one page. -z-10 inside isolate: above the card's fill, under its content.
          The coin (shapes from public/brand/symbol-color.svg), oversized and cropped in the corner. The ant (its own
          side-view silhouette: head, chest, rear, six jointed legs) walks upside down along the top edge.
          Both at 20%: on narrow phones the heading runs under the ant, and faint text over a diamond stays above 4.5:1.
          So they stand out against the woven canvas through size, not opacity: the diamonds nearly touch, covering
          about 45% of each cell instead of 25%.
          Both scale with the card's height (cqh of this layer, the card's box), up to their full 13rem and 5rem on a
          Home-sized card, so a short card (Budgets' whole month, the landing tour) shows the same composition smaller
          rather than a coin cropped to a sliver and an ant over every line. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 [container-type:size] [--a:min(5rem,27cqh)] [--c:min(13rem,71cqh)]">
        <svg
          viewBox="122 66 120 120"
          className="absolute right-[calc(var(--c)*-.23)] bottom-[calc(var(--c)*-.27)] size-(--c) -rotate-12 text-sidebar-primary opacity-20"
        >
          <pattern id={`${id}c`} width="2" height="2" patternUnits="userSpaceOnUse">
            <path d="M1 .05L1.95 1L1 1.95L.05 1Z" fill="currentColor" />
          </pattern>
          <path fill={`url(#${id}c)`} fillRule="evenodd" d="M122 126A60 60 0 1 1 242 126A60 60 0 1 1 122 126ZM134 126A48 48 0 1 0 230 126A48 48 0 1 0 134 126Z" />
          <path fill={`url(#${id}c)`} d="M164 96H173V156H164ZM164 96H183.2A20.4 20.4 0 0 1 183.2 136.8H164V127.8H183.2A11.4 11.4 0 0 0 183.2 105H164ZM154.4 109.8H210.8V114.3H154.4ZM154.4 118.8H210.8V123.3H154.4Z" />
        </svg>
        {/* The ant patrols the top edge (index.css, .ant-walk): the track is the card minus the ant's width, so
            translating it by its own width carries the ant from the left edge to the right one. */}
        <div ref={walker} className="ant-walk absolute top-0 right-(--a) left-0">
          <svg viewBox="0 0 100 60" className="ant w-(--a) -scale-y-100 text-sidebar-primary opacity-20">
            <pattern id={`${id}a`} width="2.4" height="2.4" patternUnits="userSpaceOnUse">
              <path d="M1.2 .1L2.3 1.2L1.2 2.3L.1 1.2Z" fill="currentColor" />
            </pattern>
            <path fill={`url(#${id}a)`} d="M14 30A14 10 0 1 1 42 30A14 10 0 1 1 14 30ZM47 29A8 5.5 0 1 1 63 29A8 5.5 0 1 1 47 29ZM64.5 26A7.5 7.5 0 1 1 79.5 26A7.5 7.5 0 1 1 64.5 26Z" />
            <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="0 2.4">
              <path d="M42 30H47" />
              <path className="ant-feeler" d="M76 20L82 9L94 6M73 19L76 8L86 2" />
              <path className="ant-leg" style={{ transformOrigin: '52px 33px' }} d="M52 33L44 42L38 56" />
              <path className="ant-leg ant-leg-mid" style={{ transformOrigin: '55px 34px' }} d="M55 34L56 45L52 57" />
              <path className="ant-leg" style={{ transformOrigin: '58px 33px' }} d="M58 33L66 42L74 55" />
            </g>
          </svg>
        </div>
      </div>
    </Card>
  )
}
