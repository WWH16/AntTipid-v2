// shadcn login-01 block: centred card with the form, switching between sign-in and sign-up.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Check, Loader2 } from 'lucide-react'
import { useApp } from '@/app-state'
import { api } from '@/api/endpoints'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { cn } from '@/lib/utils'

export const PASSWORD_RULES = [
  { id: 'min-length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number', test: (p: string) => /\d/.test(p) },
]

export function SignInPage() {
  const { user, signIn } = useApp()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const isSignUp = mode === 'signUp'
  const isMatched = isSignUp && confirmPassword.length > 0 && password === confirmPassword

  useEffect(() => {
    if (!isSignUp || !confirmPassword) {
      setMismatch(false)
      return
    }
    if (password === confirmPassword) {
      setMismatch(false)
      return
    }
    const timer = setTimeout(() => setMismatch(true), 400)
    return () => clearTimeout(timer)
  }, [isSignUp, password, confirmPassword])

  function switchMode(next: 'signIn' | 'signUp') {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
    setMismatch(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address, like you@example.com.')
    if (!password) return setError('Enter your password.')
    if (isSignUp) {
      const failed = PASSWORD_RULES.find((r) => !r.test(password))
      if (failed) return setError(`Password must have ${failed.label.toLowerCase()}.`)
      if (password !== confirmPassword) return setError('Passwords do not match.')
    }
    setBusy(true)
    try {
      if (isSignUp) {
        const displayName = name.trim() || email.split('@')[0]
        const created = await api.auth.signUp(displayName, email, password)
        if (!created) {
          setMode('signIn')
          setPassword('')
          setConfirmPassword('')
          setNotice('Check your email to confirm, then sign in.')
          setBusy(false)
          return
        }
        signIn(created)
      } else {
        signIn(await api.auth.signIn(email, password))
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="self-center"><Logo className="h-14" /></div>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>
              {isSignUp ? 'Create an account' : 'Sign in to your account'}
            </CardTitle>
            <CardDescription>
              {isSignUp ? 'Enter your details below to get started.' : 'Enter your email below to sign in.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} noValidate className="grid gap-6">
              {isSignUp && (
                <FormField
                  id="name"
                  label="Name"
                  placeholder="Andrea Santos"
                  autoComplete="name"
                  value={name}
                  onChange={(v) => { setName(v); setError('') }}
                />
              )}
              <FormField
                id="email"
                type="email"
                label="Email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(v) => { setEmail(v); setError(''); setNotice('') }}
              />
              <FormField
                id="password"
                type="password"
                label="Password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={password}
                onChange={(v) => { setPassword(v); setError('') }}
                toggleVisibility
              >
                {isSignUp && (
                  <ul className="grid grid-cols-2 gap-1.5 pt-1 text-xs" aria-label="Password requirements">
                    {PASSWORD_RULES.map((rule) => {
                      const met = rule.test(password)
                      return (
                        <li
                          key={rule.id}
                          className={cn(
                            'flex items-center gap-1.5 transition-colors',
                            met ? 'font-medium text-primary' : 'text-muted-foreground'
                          )}
                        >
                          <Check className={cn('size-3.5 shrink-0', met ? 'text-primary' : 'opacity-30')} />
                          <span>{rule.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </FormField>
              {isSignUp && (
                <FormField
                  id="confirmPassword"
                  type="password"
                  label="Confirm password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(v) => { setConfirmPassword(v); setError('') }}
                  toggleVisibility
                  hasError={mismatch}
                  errorMessage={mismatch ? 'Passwords do not match' : undefined}
                  isValid={isMatched}
                  successMessage={isMatched ? 'Passwords match' : undefined}
                />
              )}
              {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} {isSignUp ? 'Create account' : 'Sign in'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => switchMode(isSignUp ? 'signIn' : 'signUp')}>
                  {isSignUp ? 'Sign in' : 'Create an account'}
                </button>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
