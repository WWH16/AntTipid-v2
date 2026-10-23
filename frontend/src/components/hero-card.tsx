import { useId, type ComponentProps } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The one dark-green card per page (Home "left to spend", Budgets "whole month").
 * Same forest + lime pairing as the sidebar; child slots are re-toned for the dark surface.
 * The logo's peso coin sits oversized in the bottom corner, cropped by the card, and an ant walks
 * upside down along the top edge: faint lime halftone marks of the brand's own world, not a stock gradient.
 */
export function HeroCard({ className, children, ...props }: ComponentProps<typeof Card>) {
  const id = useId().replace(/[^\w-]/g, '')
  return (
    <Card
      className={cn(
        'relative isolate bg-primary canvas-dark text-primary-foreground ring-0',
        '[&_.text-muted-foreground]:text-primary-foreground/70 [&_[data-slot=card-description]]:text-primary-foreground/70',
        '[&_[data-slot=progress-track]]:bg-primary-foreground/15 [&_[data-slot=progress-indicator]]:bg-sidebar-primary',
        '[&_[data-slot=card-footer]]:border-primary-foreground/15 [&_[data-slot=card-footer]]:bg-transparent',
        '[&_[data-slot=skeleton]]:bg-primary-foreground/15',
        className,
      )}
      {...props}
    >
      {children}
      {/* Both marks are a fine pixel print: shapes filled with a grid of tiny diamonds, lines drawn as rows of dots. Ids are per card,
          since several cards can be on one page. -z-10 inside isolate: above the card's fill, under its content.
          The coin (shapes from public/brand/symbol-color.svg), oversized and cropped in the corner. The ant (its own
          side-view silhouette: head, chest, rear, six jointed legs) walks upside down along the top edge.
          Both at 20%: on narrow phones the heading runs under the ant, and faint text over a diamond stays above 4.5:1.
          So they stand out against the woven canvas through size, not opacity: the diamonds nearly touch, covering
          about 45% of each cell instead of 25%. */}
      <svg
        viewBox="122 66 120 120"
        aria-hidden
        className="pointer-events-none absolute -right-12 -bottom-14 -z-10 size-52 -rotate-12 text-sidebar-primary opacity-20"
      >
        <pattern id={`${id}c`} width="2" height="2" patternUnits="userSpaceOnUse">
          <path d="M1 .05L1.95 1L1 1.95L.05 1Z" fill="currentColor" />
        </pattern>
        <path fill={`url(#${id}c)`} fillRule="evenodd" d="M122 126A60 60 0 1 1 242 126A60 60 0 1 1 122 126ZM134 126A48 48 0 1 0 230 126A48 48 0 1 0 134 126Z" />
        <path fill={`url(#${id}c)`} d="M164 96H173V156H164ZM164 96H183.2A20.4 20.4 0 0 1 183.2 136.8H164V127.8H183.2A11.4 11.4 0 0 0 183.2 105H164ZM154.4 109.8H210.8V114.3H154.4ZM154.4 118.8H210.8V123.3H154.4Z" />
      </svg>
      <svg
        viewBox="0 0 100 60"
        aria-hidden
        className="pointer-events-none absolute top-0 left-[52%] -z-10 w-20 -scale-y-100 text-sidebar-primary opacity-20"
      >
        <pattern id={`${id}a`} width="2.4" height="2.4" patternUnits="userSpaceOnUse">
          <path d="M1.2 .1L2.3 1.2L1.2 2.3L.1 1.2Z" fill="currentColor" />
        </pattern>
        <path fill={`url(#${id}a)`} d="M14 30A14 10 0 1 1 42 30A14 10 0 1 1 14 30ZM47 29A8 5.5 0 1 1 63 29A8 5.5 0 1 1 47 29ZM64.5 26A7.5 7.5 0 1 1 79.5 26A7.5 7.5 0 1 1 64.5 26Z" />
        <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="0 2.4" d="M42 30H47M76 20L82 9L94 6M73 19L76 8L86 2M52 33L44 42L38 56M55 34L56 45L52 57M58 33L66 42L74 55" />
      </svg>
    </Card>
  )
}
