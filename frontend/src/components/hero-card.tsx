import type { ComponentProps } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The one dark-green card per page (Home "left to spend", Budgets "whole month").
 * Same forest + lime pairing as the sidebar; child slots are re-toned for the dark surface.
 */
export function HeroCard({ className, ...props }: ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        'bg-primary text-primary-foreground ring-0',
        '[&_.text-muted-foreground]:text-primary-foreground/70 [&_[data-slot=card-description]]:text-primary-foreground/70',
        '[&_[data-slot=progress-track]]:bg-primary-foreground/15 [&_[data-slot=progress-indicator]]:bg-sidebar-primary',
        '[&_[data-slot=card-footer]]:border-primary-foreground/15 [&_[data-slot=card-footer]]:bg-transparent',
        '[&_[data-slot=skeleton]]:bg-primary-foreground/15',
        className,
      )}
      {...props}
    />
  )
}
