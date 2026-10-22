// Supabase Auth in the browser. This is the only thing the frontend uses supabase-js for: data goes through
// the FastAPI backend, which checks the access token sent by api/client.ts.
import { createClient, type AuthError, type User as SupabaseUser } from '@supabase/supabase-js'
import type { User } from '@/types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.')
}

/** Sessions persist in localStorage and refresh themselves. */
export const supabase = createClient(url, key)

/** True when supabase-js has a session saved under its default key (sb-<project-ref>-auth-token). Without one the visitor is signed out,
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
