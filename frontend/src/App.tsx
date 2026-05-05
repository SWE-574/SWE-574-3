import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { Box } from '@chakra-ui/react'
import { useAuthStore } from '@/store/useAuthStore'
import ProtectedRoute from '@/components/ProtectedRoute'
import AdminProtectedRoute from '@/components/AdminProtectedRoute'
import RequireVerifiedEmail from '@/components/RequireVerifiedEmail'
import Navbar from '@/components/Navbar'
import { authAPI } from '@/services/authAPI'
import { toast } from 'sonner'
import { useNotificationSocket } from '@/hooks/useNotificationSocket'

// ─── Lazy-loaded Pages ────────────────────────────────────────────────────────
const HomePage               = lazy(() => import('@/pages/HomePage'))
const LoginPage              = lazy(() => import('@/pages/LoginPage'))
const RegistrationPage       = lazy(() => import('@/pages/RegistrationPage'))
const OnboardingPage         = lazy(() => import('@/pages/OnboardingPage'))
const ForgotPasswordPage     = lazy(() => import('@/pages/ForgotPasswordPage'))
const ResetPasswordPage      = lazy(() => import('@/pages/ResetPasswordPage'))
const VerifyEmailPage        = lazy(() => import('@/pages/VerifyEmailPage'))
const VerifyEmailSentPage    = lazy(() => import('@/pages/VerifyEmailSentPage'))
const DashboardPage          = lazy(() => import('@/pages/DashboardPage'))
const ServiceDetailPage      = lazy(() => import('@/pages/ServiceDetailPage'))
const PostOfferForm          = lazy(() => import('@/pages/PostOfferForm'))
const PostNeedForm           = lazy(() => import('@/pages/PostNeedForm'))
const PostEventForm          = lazy(() => import('@/pages/PostEventForm'))
const EditServiceForm        = lazy(() => import('@/pages/EditServiceForm'))
const ChatPage               = lazy(() => import('@/pages/ChatPage'))
const UserProfile            = lazy(() => import('@/pages/UserProfile'))
const PublicProfile          = lazy(() => import('@/pages/PublicProfile'))
const TransactionHistoryPage = lazy(() => import('@/pages/TransactionHistoryPage'))
const NotificationsPage      = lazy(() => import('@/pages/NotificationsPage'))
const AdminDashboard         = lazy(() => import('@/pages/AdminDashboard'))
const AdminUserDetailPage    = lazy(() => import('@/pages/AdminUserDetailPage'))
const ReportDetail           = lazy(() => import('@/pages/ReportDetail'))
const ForumPage              = lazy(() => import('@/pages/ForumPage'))
const ForumCreateTopic       = lazy(() => import('@/pages/ForumCreateTopic'))
const AchievementView        = lazy(() => import('@/pages/AchievementView'))
const NotFoundPage           = lazy(() => import('@/pages/NotFoundPage'))

// ─── Page-level Loading Fallback ──────────────────────────────────────────────
const PageFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <div>Loading…</div>
  </div>
)

// ─── Email Verification Banner ────────────────────────────────────────────────
function EmailVerificationBanner() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [isSending, setIsSending] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Only show when user is fully loaded AND is_verified is explicitly false.
  // Avoids flicker while user data is still loading (null/undefined state).
  if (dismissed || !user || user.is_verified !== false) return null

  const handleResend = async () => {
    setIsSending(true)
    try {
      await authAPI.resendVerification(user.email)
      toast.success('Verification email sent! Check your inbox.')
      navigate('/verify-email-sent', { state: { email: user.email } })
    } catch {
      toast.error('Could not send email. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, #92400E 0%, #78350F 100%)',
        borderBottom: '1px solid #92400E',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        position: 'sticky',
        top: 0,
        zIndex: 49,
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>

      {/* Message */}
      <span style={{ fontSize: '13px', color: '#FEF3C7', fontWeight: 500, lineHeight: 1.4 }}>
        <strong style={{ color: '#FDE68A' }}>Limited access</strong>
        {' '}— your email{' '}
        <span style={{ color: '#FDE68A', fontWeight: 600 }}>{user.email}</span>
        {' '}is not verified. Verify to post services, join exchanges, and use all features.
      </span>

      {/* CTA */}
      <button
        onClick={handleResend}
        disabled={isSending}
        style={{
          background: '#F59E0B',
          color: '#1C1917',
          border: 'none',
          borderRadius: '6px',
          padding: '5px 14px',
          fontSize: '12px',
          fontWeight: 700,
          cursor: isSending ? 'not-allowed' : 'pointer',
          opacity: isSending ? 0.7 : 1,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          transition: 'opacity 0.15s',
        }}
      >
        {isSending ? 'Sending…' : 'Verify Email →'}
      </button>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#D97706',
          cursor: 'pointer',
          fontSize: '16px',
          lineHeight: 1,
          padding: '2px 4px',
          flexShrink: 0,
          opacity: 0.8,
        }}
      >
        ✕
      </button>
    </div>
  )
}

// ─── Pages that render their own header (no global Navbar) ────────────────────
// Pages where the global top Navbar is hidden (they render their own navigation)
const PAGES_WITHOUT_NAVBAR = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/verify-email-sent',
  '/onboarding',
]

// Pages that fill the viewport — lock body scroll so navbar stays fixed
// and macOS elastic-bounce doesn't move content under the navbar.
const FULL_SCREEN_PREFIXES = [
  '/dashboard', '/forum', '/messages', '/admin',
  '/profile', '/public-profile',
  '/service-detail', '/post-offer', '/post-need', '/post-event',
  '/edit-service',
  '/transaction-history', '/notifications', '/achievements',
  '/onboarding',
]

// ─── Public pages where we skip the full-page spinner ─────────────────────────
const PUBLIC_AUTH_PATHS = ['/login', '/register', '/', '/forgot-password', '/reset-password', '/verify-email', '/verify-email-sent']

function App() {
  const { checkAuth, isLoading, user } = useAuthStore()
  const location = useLocation()

  const isPublicAuthPage = PUBLIC_AUTH_PATHS.includes(location.pathname)
  const showNavbar = !PAGES_WITHOUT_NAVBAR.some((p) =>
    p === location.pathname || location.pathname.startsWith(p + '/')
  )

  // Allow the long create-topic form to use normal document scrolling.
  const isForumCreateTopicPage = location.pathname === '/forum/new'

  // Lock/unlock body + html scroll for full-screen pages
  const isFullScreenPage = !isForumCreateTopicPage && FULL_SCREEN_PREFIXES.some((p) =>
    location.pathname === p || location.pathname.startsWith(p + '/')
  )
  useEffect(() => {
    const el = document.documentElement
    const body = document.body
    if (isFullScreenPage) {
      el.style.overflow = 'hidden'
      el.style.height = '100%'
      body.style.overflow = 'hidden'
      body.style.height = '100%'
    } else {
      el.style.overflow = ''
      el.style.height = ''
      body.style.overflow = ''
      body.style.height = ''
    }
    return () => {
      el.style.overflow = ''
      el.style.height = ''
      body.style.overflow = ''
      body.style.height = ''
    }
  }, [isFullScreenPage])

  useEffect(() => {
    // On public auth pages there's no session to check — skip to avoid
    // triggering the /users/me/ → 401 → refresh-fail cycle on every keystroke.
    if (PUBLIC_AUTH_PATHS.includes(location.pathname)) return

    // On protected route changes, verify session once.
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // ── Notification WebSocket (fires only when authenticated) ──────────────
  useNotificationSocket()

  if (isLoading && !user && !isPublicAuthPage) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading…</div>
      </div>
    )
  }

  // The GAP value — used as: A (above navbar), B (navbar↔section), C (section↔bottom)
  const GAP = '8px'

  return (
    <Box
      bg={showNavbar ? '#F9FAFB' : undefined}
      pt={{ base: 0, md: showNavbar ? GAP : 0 }}
    >
      {showNavbar && <Navbar />}
      {showNavbar && <EmailVerificationBanner />}
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* ── Public ───────────────────────────────────────────────── */}
          <Route path="/"               element={<HomePage />} />
          <Route path="/login"          element={<LoginPage />} />
          <Route path="/register"       element={<RegistrationPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />
          <Route path="/verify-email"    element={<VerifyEmailPage />} />
          <Route path="/verify-email-sent" element={<VerifyEmailSentPage />} />
          <Route path="/dashboard"      element={<DashboardPage />} />
          <Route path="/service-detail/:id" element={<ServiceDetailPage />} />
          <Route path="/public-profile/:userId" element={<PublicProfile />} />

          {/* ── Forum (public) — subreddit style single-page ─────────── */}
          <Route path="/forum"                element={<ForumPage />} />
          <Route path="/forum/category/:slug" element={<ForumPage />} />
          <Route path="/forum/topic/:topicId" element={<ForumPage />} />

          {/* ── Onboarding (protected, skips onboarding redirect) ────── */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute skipOnboardingCheck>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* ── Authenticated ────────────────────────────────────────── */}
          <Route
            path="/post-offer"
            element={
              <ProtectedRoute>
                <RequireVerifiedEmail actionLabel="post an Offer">
                  <PostOfferForm />
                </RequireVerifiedEmail>
              </ProtectedRoute>
            }
          />
          <Route
            path="/post-need"
            element={
              <ProtectedRoute>
                <RequireVerifiedEmail actionLabel="post a Need">
                  <PostNeedForm />
                </RequireVerifiedEmail>
              </ProtectedRoute>
            }
          />
          <Route
            path="/post-event"
            element={
              <ProtectedRoute>
                <RequireVerifiedEmail actionLabel="post an Event">
                  <PostEventForm />
                </RequireVerifiedEmail>
              </ProtectedRoute>
            }
          />
          <Route
            path="/edit-service/:id"
            element={<ProtectedRoute><EditServiceForm /></ProtectedRoute>}
          />
          <Route
            path="/messages"
            element={<ProtectedRoute><ChatPage /></ProtectedRoute>}
          />
          <Route
            path="/messages/:handshakeId"
            element={<ProtectedRoute><ChatPage /></ProtectedRoute>}
          />
          <Route
            path="/profile"
            element={<ProtectedRoute><UserProfile /></ProtectedRoute>}
          />
          <Route
            path="/transaction-history"
            element={<ProtectedRoute><TransactionHistoryPage /></ProtectedRoute>}
          />
          <Route
            path="/profile/reports"
            element={<ProtectedRoute><UserProfile /></ProtectedRoute>}
          />
          <Route
            path="/notifications"
            element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>}
          />
          <Route
            path="/achievements"
            element={<ProtectedRoute><AchievementView /></ProtectedRoute>}
          />
          <Route
            path="/forum/new"
            element={<ProtectedRoute><ForumCreateTopic /></ProtectedRoute>}
          />

          {/* ── Admin ────────────────────────────────────────────────── */}
          <Route
            path="/admin"
            element={
              <AdminProtectedRoute>
                <AdminDashboard />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/users/:userId"
            element={
              <AdminProtectedRoute>
                <AdminUserDetailPage />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/report-detail/:id"
            element={
              <AdminProtectedRoute>
                <ReportDetail />
              </AdminProtectedRoute>
            }
          />

          {/* ── 404 ──────────────────────────────────────────────────── */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Box>
  )
}

export default App
