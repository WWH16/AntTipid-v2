import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from '@/app-state'
import { AppShell } from '@/components/app-shell'
import { LoadingAuth, LoadingPage } from '@/components/states'

// Each page is its own file, downloaded the first time it is opened.
const HomePage = lazy(() => import('@/pages/home').then((m) => ({ default: m.HomePage })))
const ActivityPage = lazy(() => import('@/pages/activity').then((m) => ({ default: m.ActivityPage })))
const BudgetsPage = lazy(() => import('@/pages/budgets').then((m) => ({ default: m.BudgetsPage })))
const ReportsPage = lazy(() => import('@/pages/reports').then((m) => ({ default: m.ReportsPage })))
const SettingsPage = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })))
const LandingPage = lazy(() => import('@/pages/landing').then((m) => ({ default: m.LandingPage })))
const PrivacyPage = lazy(() => import('@/pages/privacy').then((m) => ({ default: m.PrivacyPage })))
const SignInPage = lazy(() => import('@/pages/sign-in').then((m) => ({ default: m.SignInPage })))

const page = (el: ReactNode) => <Suspense fallback={<LoadingPage />}>{el}</Suspense>

function RequireUser({ children }: { children: ReactNode }) {
  const { user, ready } = useApp()
  const { pathname } = useLocation()
  if (!ready) return <LoadingPage />
  if (user) return children
  // Signed-out visitors to / get the public page about the app; every other page asks them to sign in.
  return pathname === '/' ? page(<LandingPage />) : <Navigate to="/sign-in" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/privacy" element={<Suspense fallback={null}><PrivacyPage /></Suspense>} />
      <Route path="/sign-in" element={<Suspense fallback={<LoadingAuth />}><SignInPage /></Suspense>} />
      <Route element={<RequireUser><AppShell /></RequireUser>}>
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
