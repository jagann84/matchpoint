import { lazy, Suspense, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastContainer } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import AppLayout from './components/AppLayout'
import LoginPage from './pages/LoginPage'
import OfflineBanner from './components/OfflineBanner'
import UpdatePrompt from './components/UpdatePrompt'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const LogMatchPage = lazy(() => import('./pages/LogMatchPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const MatchDetailPage = lazy(() => import('./pages/MatchDetailPage'))
const PlayersPage = lazy(() => import('./pages/PlayersPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HeadToHeadPage = lazy(() => import('./pages/HeadToHeadPage'))
const PartnerStatsPage = lazy(() => import('./pages/PartnerStatsPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    )
  }

  if (user) {
    return <Navigate to={isMobile() ? '/log-match' : '/dashboard'} replace />
  }

  return <>{children}</>
}

// On mobile (≤768px) the user's primary action is logging a match quickly,
// so we land them on /log-match. On larger screens the dashboard overview
// is more useful as a home page. This only affects the default route ("/")
// and the post-login redirect — explicitly navigating to /dashboard on
// mobile still works fine.
const isMobile = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(max-width: 768px)').matches

function AppRoutes() {
  // useMemo so the check runs once per mount, not on every render. Screen
  // size doesn't change within a single page lifecycle (and if the user
  // rotates their phone, the app re-renders but the breakpoint is generous
  // enough that a landscape phone is still < 768px in most cases).
  const homePath = useMemo(() => isMobile() ? '/log-match' : '/dashboard', [])

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    }>
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/log-match" element={<LogMatchPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:id" element={<MatchDetailPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/h2h/:id" element={<HeadToHeadPage />} />
        <Route path="/partner/:id" element={<PartnerStatsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to={homePath} replace />} />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastContainer />
          <OfflineBanner />
          <UpdatePrompt />
          <SpeedInsights />
          <Analytics />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
