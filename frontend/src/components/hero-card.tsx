import type { ComponentProps } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The one dark-green card per page (Home "left to spend", Budgets "whole month").
 * Same forest + lime pairing as the sidebar; child slots are re-toned for the dark surface.
 * The ant from the logo walks along the bottom corner, its feet cut by the card edge,
 * as a faint lime watermark: the brand's mark, not a stock gradient.
 */
export function HeroCard({ className, children, ...props }: ComponentProps<typeof Card>) {
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
      {/* The ant from public/brand/symbol-color.svg, walking in from the corner toward the numbers.
          -z-10 inside isolate: above the card's fill, under its content. */}
      <svg
        viewBox="4 60 132 130"
        aria-hidden
        className="pointer-events-none absolute right-3 -bottom-3 -z-10 w-28 text-sidebar-primary opacity-[.12]"
      >
        <path fill="currentColor" d="M24 128A22 22 0 1 1 68 128A22 22 0 1 1 24 128ZM67 136A30 18 0 1 1 127 136A30 18 0 1 1 67 136ZM45.8 108.45L38.3 80.45A6 6 0 0 0 26.7 83.55L34.2 111.55A6 6 0 0 0 45.8 108.45ZM35.13 76.61L14.63 66.61A6 6 0 0 0 9.37 77.39L29.87 87.39A6 6 0 0 0 35.13 76.61ZM73.87 145.84L61.87 179.84A6.5 6.5 0 0 0 74.13 184.16L86.13 150.16A6.5 6.5 0 0 0 73.87 145.84ZM90.5 148L90.5 182A6.5 6.5 0 0 0 103.5 182L103.5 148A6.5 6.5 0 0 0 90.5 148ZM107.87 150.16L119.87 184.16A6.5 6.5 0 0 0 132.13 179.84L120.13 145.84A6.5 6.5 0 0 0 107.87 150.16Z" />
      </svg>
    </Card>
  )
}
