// Cloudflare Turnstile, so bots can't hammer sign-in, sign-up and the email endpoints.
// Supabase Auth checks the token (Authentication > Attack Protection > CAPTCHA); the backend never sees it.
import { useEffect, useRef } from 'react'

/** Unset means no widget and no token, which works only while CAPTCHA is off in Supabase. */
export const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

// Loaded on first use, so the landing page and the app don't download it.
let script: Promise<void> | undefined
const loadScript = () => (script ??= new Promise<void>((resolve, reject) => {
  const s = document.createElement('script')
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  s.async = true
  s.onload = () => resolve()
  s.onerror = () => { script = undefined; reject(new Error('Turnstile script failed to load')) }
  document.head.append(s)
}))

/**
 * Always visible. Reports '' while there's no usable token.
 * A token works for one auth call: change the key after each call to get a fresh widget and token.
 * An expired token (after 5 minutes) is cleared, and the widget fetches a new one by itself.
 * Reserves the widget's height so the form doesn't jump; put it in a gap-free wrapper with the submit button.
 */
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let widgetId: string | undefined
    let gone = false
    loadScript()
      .then(() => {
        if (gone || !el.current || !window.turnstile) return
        widgetId = window.turnstile.render(el.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          size: 'flexible',
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        })
      })
      .catch(() => onToken(''))
    return () => {
      gone = true
      onToken('')
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [onToken])

  return TURNSTILE_SITE_KEY ? <div ref={el} className="mb-4 min-h-[65px]" /> : null
}
