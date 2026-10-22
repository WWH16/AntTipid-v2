// Supabase Auth in the browser. Auth is the only Supabase service the frontend talks to (data goes through the
// FastAPI backend, which checks the access token sent by api/client.ts), so it uses auth-js on its own instead of
// supabase-js, which would also ship the database, realtime and storage clients to every page.
import { AuthClient, type AuthError, type User as SupabaseUser } from '@supabase/auth-js'
import type { User } from '@/types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.')
}

/** Sessions persist in localStorage and refresh themselves. Same settings and storage key as supabase-js's
 *  createClient, so sessions saved before the switch stay signed in. */
export const supabase = {
  auth: new AuthClient({
    url: new URL('auth/v1', url.endsWith('/') ? url : `${url}/`).href,
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    storageKey: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  }),
}

/** True when a session is saved under supabase-js's default key (sb-<project-ref>-auth-token). Without one the visitor is signed out,
 *  so public pages can render before onAuthStateChange reports. Assumes signed in if storage can't be read. */
export function hasSavedSession() {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
  } catch {
    return true
  }
}

export const toUser = (u: SupabaseUser): User => ({
  name: (u.user_metadata?.name as string | undefined)?.trim() || (u.email ?? '').split('@')[0],
  email: u.email ?? '',
})

/** Supabase's auth errors, worded for the sign-in form. */
export function authMessage(e: AuthError): string {
  // Thrown by updateUser when the reset link's session is gone; it has a name but no code.
  if (e.name === 'AuthSessionMissingError') return 'Reset link expired or invalid. Request a new one.'
  switch (e.code) {
    case 'invalid_credentials': return 'Wrong email or password.'
    case 'email_not_confirmed': return 'Confirm your email first. Check your inbox for the link.'
    case 'user_already_exists':
    case 'email_exists': return 'There is already an account with this email. Sign in instead.'
    case 'over_email_send_rate_limit': return 'Please wait 60 seconds before requesting another email.'
    case 'over_request_rate_limit': return 'Too many tries. Wait a minute, then try again.'
    // Missing, expired or already-used Turnstile token. The form gets a fresh one after every attempt.
    case 'captcha_failed': return 'Couldn’t confirm you’re human. Try again.'
    case 'session_not_found':
    case 'session_expired': return 'Reset link expired or invalid. Request a new one.'
    default: return e.message
  }
}
