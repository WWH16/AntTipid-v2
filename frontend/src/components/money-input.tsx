import type { ComponentProps } from 'react'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'

/** Peso amount field: keeps digits and one decimal point (and a leading minus with allowNegative). */
export function MoneyInput({ value, onChange, allowNegative, ...props }: Omit<ComponentProps<typeof InputGroupInput>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  allowNegative?: boolean
}) {
  const clean = (v: string) => {
    const sign = allowNegative && v.trimStart().startsWith('-') ? '-' : ''
    return sign + v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
  }
  return (
    <InputGroup>
      <InputGroupAddon><InputGroupText>₱</InputGroupText></InputGroupAddon>
      <InputGroupInput inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(clean(e.target.value))} {...props} />
    </InputGroup>
  )
}
