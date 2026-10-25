// Thin fetch wrapper for the FastAPI backend. FastAPI returns errors as {"detail": "..."}.
// Relative by default: the Vite dev server proxies /api to FastAPI (vite.config.ts), so phones on the LAN work too.
import { fieldError } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export const API_URL = import.meta.env.VITE_API_URL ?? '/api'

type Query = Record<string, string | number | undefined>

/** The signed-in user's access token as a Bearer header. getSession() refreshes it first when it's about to expire. */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
}

async function request(path: string, init: RequestInit & { query?: Query } = {}): Promise<Response> {
  const url = new URL(API_URL + path, location.origin)
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(await authHeader()),
      ...init.headers,
    },
  }).catch((e: Error) => {
    // No response at all: the browser's own "Failed to fetch" means nothing to people. A cancel stays a cancel.
    if (e.name === 'AbortError') throw e
    throw new Error("You're offline. Check your connection and try again.")
  })
  if (!res.ok) {
    // The session is gone on the server's side (expired, revoked): drop it here too, which shows the sign-in page.
    if (res.status === 401) void supabase.auth.signOut({ scope: 'local' })
    const body = await res.json().catch(() => null)
    // status rides along so callers can tell a refusal (409) from a failure.
    throw Object.assign(new Error(typeof body?.detail === 'string' ? body.detail : fieldError(body?.detail) ?? `Request failed (${res.status})`), { status: res.status })
  }
  return res
}

export async function http<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const res = await request(path, init)
  return res.status === 204 ? (null as T) : res.json()
}

/** Fetch a file with the auth header and hand it to the browser as a download (a plain link can't send the header). */
export async function download(path: string, query: Query, fallbackName: string) {
  const res = await request(path, { query })
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName
  const a = document.createElement('a')
  a.href = URL.createObjectURL(await res.blob())
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })
