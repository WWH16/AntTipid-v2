// shadcn login-01 block: centred card with the form, switching between sign-in and sign-up.
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useApp } from '@/app-state'
import { api } from '@/api/endpoints'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignInPage() {
  const { user, signIn } = useApp()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const isSignUp = mode === 'signUp'

  function switchMode(next: 'signIn' | 'signUp') {
    setMode(next)
    setError('')
    setNotice('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address, like you@example.com.')
    if (!password) return setError('Enter your password.')
    if (isSignUp && password.length < 6) return setError('Use at least 6 characters for your password.')
    setBusy(true)
    try {
      if (isSignUp) {
        const displayName = name.trim() || email.split('@')[0]
        const created = await api.auth.signUp(displayName, email, password)
        if (!created) {
          setMode('signIn')
          setPassword('')
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
                <Input
                  id="password"
                  type="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                />
              </div>
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
