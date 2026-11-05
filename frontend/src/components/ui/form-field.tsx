import { useState, type ReactNode } from 'react'
import { Check, EyeClosed } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface FormFieldProps extends Omit<React.ComponentProps<typeof Input>, 'onChange'> {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  errorMessage?: string | null
  successMessage?: string | null
  toggleVisibility?: boolean
  children?: ReactNode
  labelRight?: ReactNode
}

/** Lucide's EyeClosed mirrored into an open eye, because Lucide's Eye has no lashes to match it. */
function EyeOpen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4">
      <path d="M2 15a10.645 10.645 0 0 1 20 0" />
      <path d="M2 15a14 14 0 0 0 20 0" />
      <circle cx="12" cy="13.5" r="2.5" />
      <path d="m15 5-.722 3.25" />
      <path d="m20 8-1.726 2.05" />
      <path d="m4 8 1.726 2.05" />
      <path d="m9 5 .722 3.25" />
    </svg>
  )
}

export function FormField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  errorMessage,
  successMessage,
  toggleVisibility,
  className,
  children,
  labelRight,
  ...inputProps
}: FormFieldProps) {
  const [showPassword, setShowPassword] = useState(false)
  const inputType = toggleVisibility && showPassword ? 'text' : type
  const isInvalid = Boolean(errorMessage)
  const isSuccess = !isInvalid && Boolean(successMessage)

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {labelRight}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={isInvalid}
          className={cn(
            toggleVisibility && 'pr-9',
            isInvalid && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20',
            isSuccess && 'border-primary/60 focus-visible:border-primary focus-visible:ring-primary/20'
          )}
          {...inputProps}
        />
        {toggleVisibility && (
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          >
            {showPassword ? <EyeOpen /> : <EyeClosed className="size-4" />}
          </button>
        )}
      </div>
      {errorMessage && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage}
        </p>
      )}
      {isSuccess && (
        <p role="status" className="flex items-center gap-1 text-xs text-primary">
          <Check className="size-3.5" />
          <span>{successMessage}</span>
        </p>
      )}
      {children}
    </div>
  )
}
