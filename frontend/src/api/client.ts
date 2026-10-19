// Thin fetch wrapper for the FastAPI backend. FastAPI returns errors as {"detail": "..."}.
// Relative by default: the Vite dev server proxies /api to FastAPI (vite.config.ts), so phones on the LAN work too.
export const API_URL = import.meta.env.VITE_API_URL ?? '/api'
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

type Query = Record<string, string | number | undefined>

export async function http<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const url = new URL(API_URL + path, location.origin)
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: init.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(typeof body?.detail === 'string' ? body.detail : `Request failed (${res.status})`)
  }
  return res.status === 204 ? (null as T) : res.json()
}

export const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })
