// shadcn login-01 block: centred card with the form.
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address, like you@example.com.')
    if (!password) return setError('Enter your password.')
    setBusy(true)
    try {
      signIn(await api.auth.signIn(email, password))
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center"><Logo /></div>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>Sign in to your account</CardTitle>
            <CardDescription>Enter your email below to sign in.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} noValidate className="grid gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">Prototype: any email and password signs you in with sample data.</p>
      </div>
    </div>
  )
}
