import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppStateProvider } from '@/app-state'
import { ErrorBoundary } from '@/components/error-boundary'
import { PageScrollbar } from '@/components/page-scrollbar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App'
import './index.css'

// Offline shell and installability. Production only: in dev the worker would cache Vite's unbundled modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // The build id in the address makes each deploy a new worker: the file itself never changes, so without it the browser
  // would keep the first worker forever, never caching a new deploy's files or clearing old ones.
  window.addEventListener('load', () => navigator.serviceWorker.register(`/service-worker.js?v=${import.meta.env.VITE_BUILD_ID}`))
}

// A tab opened before a deploy asks for page files the deploy replaced. Reload once to get the new ones, instead of the
// failed import ending in the error screen. Not again within a minute, so a file that's really missing can't loop.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem('anttipid-reloaded') ?? 0) < 60_000) return
    sessionStorage.setItem('anttipid-reloaded', String(Date.now()))
  } catch { /* storage blocked: reload anyway */ }
  event.preventDefault()
  location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AppStateProvider>
          <TooltipProvider>
            <App />
            <PageScrollbar />
            <Toaster position="top-center" theme="light" />
          </TooltipProvider>
        </AppStateProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
