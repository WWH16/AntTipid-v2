import type { ImgHTMLAttributes } from 'react'

/** The kept brand marks, served from public/brand (copied from design/logo). */
const MARKS = {
  shield: '/brand/shield.svg', // solid master crest
  outline: '/brand/shield-outline.svg', // electric duotone outline
  ledge: '/brand/shield-ledge.svg', // peeks over a card edge
  tile: '/brand/shield-tile.svg', // app tile, empty states
  carrier: '/brand/carrier-peso.svg', // on-track budgets
} as const

/** Decorative by default (alt=""); pass alt when the mark carries meaning. */
export function BrandMark({ mark, alt = '', ...props }: { mark: keyof typeof MARKS } & ImgHTMLAttributes<HTMLImageElement>) {
  return <img src={MARKS[mark]} alt={alt} draggable={false} {...props} />
}
