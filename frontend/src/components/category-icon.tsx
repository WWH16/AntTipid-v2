import { ArrowLeftRight, Tag } from 'lucide-react'
import { ItemMedia } from '@/components/ui/item'
import { CATEGORY_ICONS } from '@/lib/category-icons'
import { cn } from '@/lib/utils'
import type { Category, Transaction } from '@/types'


/** Lucide icon for a category (default size), or the transfer arrows. */
export function CategoryIcon({ category, kind }: { category?: Category; kind?: Transaction['kind'] }) {
  const Icon = kind === 'transfer' ? ArrowLeftRight : (CATEGORY_ICONS[category?.icon ?? 'other'] ?? Tag)
  return <Icon />
}

/** Item media chip: income on primary, spending on accent, transfers on muted. Theme colours only. */
export function CategoryMedia({ category, kind }: { category?: Category; kind?: Transaction['kind'] }) {
  const k = kind ?? category?.kind
  return (
    <ItemMedia
      variant="icon"
      className={cn(
        'size-8 rounded-md',
        k === 'income' ? 'bg-primary text-primary-foreground' : k === 'transfer' ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground',
      )}
    >
      <CategoryIcon category={category} kind={kind} />
    </ItemMedia>
  )
}
