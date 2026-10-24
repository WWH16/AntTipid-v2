import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppStateProvider } from '@/app-state'
import { PageScrollbar } from '@/components/page-scrollbar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App'
import './index.css'

// Offline shell and installability. Production only: in dev the worker would cache Vite's unbundled modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <TooltipProvider>
          <App />
          <PageScrollbar />
          <Toaster position="top-center" theme="light" />
        </TooltipProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
)
