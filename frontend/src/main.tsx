import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppStateProvider } from '@/app-state'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <TooltipProvider>
          <App />
          <Toaster position="top-center" theme="light" />
        </TooltipProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
)
