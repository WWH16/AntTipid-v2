// shadcn login-01 block: centred card with the form, switching between sign-in, sign-up, forgot password, reset, and email confirmation.
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Loader2, Mail } from 'lucide-react'
import { useApp } from '@/app-state'
import { api } from '@/api/endpoints'
import { GoogleIcon } from '@/components/brand-icons'
import { LogoWithTagline } from '@/components/logo'
import { LoadingAuth } from '@/components/states'
import { TURNSTILE_SITE_KEY, Turnstile } from '@/components/turnstile'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConsentNote } from '@/components/legal-page'
import { FormField } from '@/components/ui/form-field'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const PASSWORD_RULES = [
  { id: 'min-length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number', test: (p: string) => /\d/.test(p) },
]

type AuthMode = 'signIn' | 'signUp' | 'forgot' | 'reset' | 'emailSent'

const COPY: Record<Exclude<AuthMode, 'emailSent'>, { title: string; description: string; cta: string }> = {
  signIn: { title: 'Sign in to your account', description: 'Enter your email below to sign in.', cta: 'Sign in' },
  signUp: { title: 'Create an account', description: 'Enter your details below to get started.', cta: 'Create account' },
  forgot: { title: 'Reset your password', description: 'Enter your email and we’ll send you a reset link.', cta: 'Send reset link' },
  reset: { title: 'Set new password', description: 'Enter your new password below.', cta: 'Update password' },
}

export function SignInPage() {
  const { user, ready, signIn } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isResetLink = searchParams.get('mode') === 'reset'
  // Supabase sends expired links and unfinished Google sign-ins back with #error_description=... instead of a session.
  const linkError = new URLSearchParams(location.hash.slice(1)).get('error_description')
  const [mode, setMode] = useState<AuthMode>(() =>
    linkError ? (isResetLink ? 'forgot' : 'signIn')
      : isResetLink || location.hash.includes('type=recovery') ? 'reset'
      : searchParams.get('mode') === 'signup' ? 'signUp' : 'signIn')
  const [sentEmailType, setSentEmailType] = useState<'reset' | 'signUp'>('reset')
  const [cooldown, setCooldown] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(!linkError ? ''
    : isResetLink ? 'That email link is invalid or has expired. Request a new one.'
    : 'Sign-in didn’t finish. Try again.')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  // Turnstile token for the next auth call. Each token works once, so every call bumps captchaKey for a fresh widget.
  const [captcha, setCaptcha] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  const isSignUp = mode === 'signUp'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset'
  const isSignIn = mode === 'signIn'
  const needsNewPassword = isSignUp || isReset
  // Setting a new password from a reset link is already signed in, so it doesn't call a CAPTCHA-checked endpoint.
  const needsCaptcha = !!TURNSTILE_SITE_KEY && !isReset
  const waitingForCaptcha = needsCaptcha && !captcha
  const freshCaptcha = () => setCaptchaKey((k) => k + 1)

  // Cooldown countdown for resending email
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((prev) => Math.max(0, prev - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // Listen for Supabase password recovery events (from email links)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset')
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // After the hooks: hold the form until the saved session is read, so a signed-in visitor isn't shown it on the way to /.
  if (!ready) return <LoadingAuth />
  // A recovery link signs the user in, and the reset form must stay up until the new password is saved.
  if (user && !isReset) return <Navigate to="/" replace />

  // Only flag a mismatch once the confirmation stops being a prefix of the password, so typing it isn't nagged.
  const mismatch = needsNewPassword && !!confirmPassword && !password.startsWith(confirmPassword)
  const isMatched = needsNewPassword && !!confirmPassword && password === confirmPassword

  function switchMode(next: AuthMode) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    const inputs = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>('input:not([type=hidden])'))
    const i = inputs.indexOf(e.target as HTMLInputElement)
    if (i >= 0 && i < inputs.length - 1) {
      e.preventDefault()
      inputs[i + 1].focus()
    }
  }

  /** On success the browser is already leaving for Google, so busy stays on. */
  async function continueWithGoogle() {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await api.auth.signInWithGoogle()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  /** Sends the reset or confirmation email, then shows the "Check your email" screen with a 60s resend cooldown. */
  async function sendEmail(type: 'reset' | 'signUp') {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await (type === 'reset' ? api.auth.resetPassword(email, captcha) : api.auth.resendSignUp(email, captcha))
      if (mode === 'emailSent') setNotice('A new link has been sent!')
      setSentEmailType(type)
      setCooldown(60)
      setMode('emailSent')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      freshCaptcha()
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')

    if (!isReset && !/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address, like you@example.com.')
    if (isForgot) return sendEmail('reset')
    if (!password) return setError(isReset ? 'Enter your new password.' : 'Enter your password.')
    if (needsNewPassword) {
      const failed = PASSWORD_RULES.find((r) => !r.test(password))
      if (failed) return setError(`Password must have ${failed.label.toLowerCase()}.`)
      if (password !== confirmPassword) return setError('Passwords do not match.')
    }
    setBusy(true)
    try {
      if (isReset) {
        signIn(await api.auth.updatePassword(password))
        setNotice('Password updated successfully! Redirecting...')
        setTimeout(() => navigate('/', { replace: true }), 1000)
        return
      }
      if (isSignUp) {
        const displayName = name.trim() || email.split('@')[0]
        const created = await api.auth.signUp(displayName, email, password, captcha)
        if (!created) {
          setSentEmailType('signUp')
          setCooldown(60)
          setMode('emailSent')
          setBusy(false)
          return
        }
        signIn(created)
      } else {
        signIn(await api.auth.signIn(email, password, captcha))
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    } finally {
      if (!isReset) freshCaptcha()
    }
  }

  // Dedicated "Check your email" screen
  if (mode === 'emailSent') {
    return (
      <div className="flex min-h-svh w-full items-start justify-center px-4 pt-10 pb-8 sm:items-center sm:p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link to="/" aria-label="AntTipid home" className="self-start rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:self-center"><LogoWithTagline /></Link>
          <Card className="text-center max-sm:gap-5 max-sm:bg-transparent max-sm:py-0 max-sm:overflow-visible max-sm:ring-0 max-sm:*:px-0">
            <CardHeader className="flex flex-col items-center gap-2 pb-2">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mail className="size-6" />
              </div>
              <CardTitle role="heading" aria-level={1} className="text-xl font-semibold">Check your email</CardTitle>
              <CardDescription className="text-balance">
                {sentEmailType === 'reset'
                  ? 'We sent a password reset link to '
                  : 'We sent an account confirmation link to '}
                <span className="font-medium text-foreground">{email}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-xs text-muted-foreground">
                Didn't get the email? Check your spam folder or wait 60 seconds before requesting another email.
              </p>
              {notice && <p role="status" className="text-xs text-primary">{notice}</p>}
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
              <div className="grid">
                {needsCaptcha && <Turnstile key={captchaKey} onToken={setCaptcha} />}
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy || cooldown > 0 || waitingForCaptcha}
                  onClick={() => sendEmail(sentEmailType)}
                >
                  {busy && <Loader2 className="animate-spin" />}
                  {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
                </Button>
              </div>
              <Button
                variant="ghost"
                className="w-full text-sm"
                onClick={() => switchMode('signIn')}
              >
                Back to sign in
              </Button>
            </CardContent>
          </Card>
          <nav aria-label="Legal" className="flex justify-center gap-4 text-xs text-muted-foreground"><Link to="/terms" className="underline-offset-4 hover:text-foreground hover:underline">Terms</Link><Link to="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">Privacy policy</Link></nav>
        </div>
      </div>
    )
  }

  const { title, description, cta } = COPY[mode]
  const [prompt, linkLabel, linkTarget]: [string, string, AuthMode] = isSignIn
    ? ["Don't have an account?", 'Create an account', 'signUp']
    : isSignUp
    ? ['Already have an account?', 'Sign in', 'signIn']
    : ['', 'Back to sign in', 'signIn']

  return (
    <div className="flex min-h-svh w-full items-start justify-center px-4 pt-10 pb-8 sm:items-center sm:p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link to="/" aria-label="AntTipid home" className="self-start rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:self-center"><LogoWithTagline /></Link>
        <Card className="max-sm:gap-5 max-sm:bg-transparent max-sm:py-0 max-sm:overflow-visible max-sm:ring-0 max-sm:*:px-0">
          <CardHeader>
            <CardTitle role="heading" aria-level={1} className="text-xl font-semibold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:gap-6">
            {(isSignIn || isSignUp) && (
              <>
                <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={continueWithGoogle}>
                  <GoogleIcon /> Continue with Google
                </Button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Separator className="flex-1" /> or <Separator className="flex-1" />
                </div>
              </>
            )}
            <form onSubmit={submit} onKeyDown={handleFormKeyDown} noValidate className="grid gap-5 sm:gap-6">
              {isSignUp && (
                <FormField
                  id="name"
                  label="Name"
                  placeholder="Andrea Santos"
                  autoComplete="name"
                  value={name}
                  onChange={(v) => { setName(v); setError('') }}
                  enterKeyHint="next"
                />
              )}
              {!isReset && (
                <FormField
                  id="email"
                  type="email"
                  label="Email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(v) => { setEmail(v); setError(''); setNotice('') }}
                  enterKeyHint={isForgot ? 'go' : 'next'}
                />
              )}
              {!isForgot && (
                <FormField
                  key={mode}
                  id="password"
                  type="password"
                  label={isReset ? 'New password' : 'Password'}
                  labelRight={
                    isSignIn && (
                      <button
                        type="button"
                        tabIndex={-1}
                        className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                        onClick={() => switchMode('forgot')}
                      >
                        Forgot password?
                      </button>
                    )
                  }
                  autoComplete={isSignIn ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(v) => { setPassword(v); setError('') }}
                  toggleVisibility
                  enterKeyHint={isSignIn ? 'go' : 'next'}
                >
                  {needsNewPassword && (
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
              )}
              {needsNewPassword && (
                <FormField
                  id="confirmPassword"
                  type="password"
                  label={isReset ? 'Confirm new password' : 'Confirm password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(v) => { setConfirmPassword(v); setError('') }}
                  toggleVisibility
                  errorMessage={mismatch ? 'Passwords do not match' : undefined}
                  successMessage={isMatched ? 'Passwords match' : undefined}
                  enterKeyHint="go"
                />
              )}
              {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="grid">
                {needsCaptcha && <Turnstile key={captchaKey} onToken={setCaptcha} />}
                <Button type="submit" className="w-full" disabled={busy || waitingForCaptcha}>
                  {busy && <Loader2 className="animate-spin" />} {cta}
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {prompt && `${prompt} `}
                <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => switchMode(linkTarget)}>
                  {linkLabel}
                </button>
              </p>
            </form>
          </CardContent>
        </Card>
        <ConsentNote />
      </div>
    </div>
  )
}
