import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from '@/app-state'
import { LoadingAuth, LoadingDocument, LoadingPage, LoadingShell } from '@/components/states'
import { hasSavedSession } from '@/lib/supabase'

// Each page is its own file. The signed-in pages are fetched in the background once the app is up (see
// RequireUser), so tapping a nav link renders at once instead of waiting for the file.
const APP_PAGES = [
  () => import('@/pages/home'),
  () => import('@/pages/activity'),
  () => import('@/pages/budgets'),
  () => import('@/pages/reports'),
  () => import('@/pages/settings'),
] as const
const HomePage = lazy(() => APP_PAGES[0]().then((m) => ({ default: m.HomePage })))
const ActivityPage = lazy(() => APP_PAGES[1]().then((m) => ({ default: m.ActivityPage })))
const BudgetsPage = lazy(() => APP_PAGES[2]().then((m) => ({ default: m.BudgetsPage })))
const ReportsPage = lazy(() => APP_PAGES[3]().then((m) => ({ default: m.ReportsPage })))
const SettingsPage = lazy(() => APP_PAGES[4]().then((m) => ({ default: m.SettingsPage })))
const PrintReportPage = lazy(() => import('@/pages/print-report').then((m) => ({ default: m.PrintReportPage })))
const HelpPrdPage = lazy(() => import('@/pages/help-prd').then((m) => ({ default: m.HelpPrdPage })))
const HelpTrdPage = lazy(() => import('@/pages/help-trd').then((m) => ({ default: m.HelpTrdPage })))
const LandingPage = lazy(() => import('@/pages/landing').then((m) => ({ default: m.LandingPage })))
const PrivacyPage = lazy(() => import('@/pages/privacy').then((m) => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('@/pages/terms').then((m) => ({ default: m.TermsPage })))
const SignInPage = lazy(() => import('@/pages/sign-in').then((m) => ({ default: m.SignInPage })))
// The signed-in shell (sidebar, drawers, add-transaction sheet) stays out of the first download, so the landing page
// paints sooner. A returning user's shell and Home start downloading right away instead of one after the other.
const loadShell = () => import('@/components/app-shell')
const AppShell = lazy(() => loadShell().then((m) => ({ default: m.AppShell })))
if (hasSavedSession()) {
  void loadShell()
  void APP_PAGES[0]()
}

const page = (el: ReactNode) => <Suspense fallback={<LoadingPage />}>{el}</Suspense>

/** `loading` stands in while the session is read: the shell's shape for shell pages, a plain document otherwise. */
function RequireUser({ children, loading = <LoadingDocument /> }: { children: ReactNode; loading?: ReactNode }) {
  const { user, ready } = useApp()
  const { pathname } = useLocation()
  useEffect(() => {
    if (!user) return
    // After the first screen settles; Safari has no requestIdleCallback.
    const id = setTimeout(() => APP_PAGES.forEach((load) => void load()), 1500)
    return () => clearTimeout(id)
  }, [user])
  // Signed-out visitors to / get the public page about the app; every other page asks them to sign in.
  // With no saved session there's nothing to wait for, so / skips the app skeleton and shows the landing page at once.
  const landing = <Suspense fallback={null}><LandingPage /></Suspense>
  if (!ready) return pathname === '/' && !hasSavedSession() ? landing : loading
  if (user) return children
  return pathname === '/' ? landing : <Navigate to="/sign-in" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/privacy" element={<Suspense fallback={null}><PrivacyPage /></Suspense>} />
      <Route path="/terms" element={<Suspense fallback={null}><TermsPage /></Suspense>} />
      <Route path="/sign-in" element={<Suspense fallback={<LoadingAuth />}><SignInPage /></Suspense>} />
      <Route path="/reports/print" element={<RequireUser><Suspense fallback={<LoadingDocument />}><PrintReportPage /></Suspense></RequireUser>} />
      <Route path="/help/prd" element={<RequireUser><Suspense fallback={<LoadingDocument />}><HelpPrdPage /></Suspense></RequireUser>} />
      <Route path="/help/trd" element={<RequireUser><Suspense fallback={<LoadingDocument />}><HelpTrdPage /></Suspense></RequireUser>} />
      <Route element={<RequireUser loading={<LoadingShell />}><Suspense fallback={<LoadingShell />}><AppShell /></Suspense></RequireUser>}>
        <Route index element={page(<HomePage />)} />
        <Route path="activity" element={page(<ActivityPage />)} />
        <Route path="budgets" element={page(<BudgetsPage />)} />
        <Route path="reports" element={page(<ReportsPage />)} />
        <Route path="settings" element={page(<SettingsPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
