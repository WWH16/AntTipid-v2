import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Option = { value: string; label: string }

/** shadcn Select for the common case: a list of options, a value, and a change handler. */
export function SimpleSelect({ id, value, onChange, options, placeholder, className, 'aria-label': ariaLabel }: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  'aria-label'?: string
}) {
  return (
    <Select items={options} value={value || null} onValueChange={(v) => onChange((v as string | null) ?? '')}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
