// shadcn login-01 block: centred card with the form, switching between sign-in and sign-up.
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useApp } from '@/app-state'
import { api } from '@/api/endpoints'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const isSignUp = mode === 'signUp'

  function switchMode(next: 'signIn' | 'signUp') {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
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
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Andrea Santos"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError('') }}
                  />
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); setNotice('') }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
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
              </div>
              {isSignUp && (
                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
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
