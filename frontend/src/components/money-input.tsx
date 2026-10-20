import type { ComponentProps } from 'react'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { cleanMoneyInput, formatMoneyInput } from '@/lib/format'

/** Peso amount field: shows thousand commas while keeping raw digits and one decimal point in state. */
export function MoneyInput({ value, onChange, allowNegative, ...props }: Omit<ComponentProps<typeof InputGroupInput>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  allowNegative?: boolean
}) {
  return (
    <InputGroup>
      <InputGroupAddon><InputGroupText>₱</InputGroupText></InputGroupAddon>
      <InputGroupInput
        inputMode="decimal"
        autoComplete="off"
        value={formatMoneyInput(value, allowNegative)}
        onChange={(e) => onChange(cleanMoneyInput(e.target.value, allowNegative))}
        {...props}
      />
    </InputGroup>
  )
}
