import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import ProtectedRoute from '@/components/ProtectedRoute'
import AdminProtectedRoute from '@/components/AdminProtectedRoute'
import Navbar from '@/components/Navbar'

// ─── Lazy-loaded Pages ────────────────────────────────────────────────────────
const HomePage               = lazy(() => import('@/pages/HomePage'))
const LoginPage              = lazy(() => import('@/pages/LoginPage'))
const RegistrationPage       = lazy(() => import('@/pages/RegistrationPage'))
const OnboardingPage         = lazy(() => import('@/pages/OnboardingPage'))
const DashboardPage          = lazy(() => import('@/pages/DashboardPage'))
const ServiceDetailPage      = lazy(() => import('@/pages/ServiceDetailPage'))
const PostOfferForm          = lazy(() => import('@/pages/PostOfferForm'))
const PostNeedForm           = lazy(() => import('@/pages/PostNeedForm'))
const ChatPage               = lazy(() => import('@/pages/ChatPage'))
const UserProfile            = lazy(() => import('@/pages/UserProfile'))
const PublicProfile          = lazy(() => import('@/pages/PublicProfile'))
const TransactionHistoryPage = lazy(() => import('@/pages/TransactionHistoryPage'))
const NotificationsPage      = lazy(() => import('@/pages/NotificationsPage'))
const AdminDashboard         = lazy(() => import('@/pages/AdminDashboard'))
const ReportDetail           = lazy(() => import('@/pages/ReportDetail'))
const ForumCategories        = lazy(() => import('@/pages/ForumCategories'))
const ForumTopicList         = lazy(() => import('@/pages/ForumTopicList'))
const ForumTopicDetail       = lazy(() => import('@/pages/ForumTopicDetail'))
const ForumCreateTopic       = lazy(() => import('@/pages/ForumCreateTopic'))
const AchievementView        = lazy(() => import('@/pages/AchievementView'))
const NotFoundPage           = lazy(() => import('@/pages/NotFoundPage'))

// ─── Page-level Loading Fallback ──────────────────────────────────────────────
const PageFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <div>Loading…</div>
  </div>
)

// ─── Pages that render their own header (no global Navbar) ────────────────────
const PAGES_WITHOUT_NAVBAR = ['/', '/login', '/register']

// ─── Public pages where we skip the full-page spinner ─────────────────────────
const PUBLIC_AUTH_PATHS = ['/login', '/register', '/']

function App() {
  const { checkAuth, isLoading, user } = useAuthStore()
  const location = useLocation()

  const isPublicAuthPage = PUBLIC_AUTH_PATHS.includes(location.pathname)
  const showNavbar = !PAGES_WITHOUT_NAVBAR.includes(location.pathname)

  useEffect(() => {
    checkAuth()
  }, [location.pathname, checkAuth])

  if (isLoading && !user && !isPublicAuthPage) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading…</div>
      </div>
    )
  }

  return (
    <>
      {showNavbar && <Navbar />}
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* ── Public ───────────────────────────────────────────────── */}
          <Route path="/"               element={<HomePage />} />
          <Route path="/login"          element={<LoginPage />} />
          <Route path="/register"       element={<RegistrationPage />} />
          <Route path="/dashboard"      element={<DashboardPage />} />
          <Route path="/service-detail/:id" element={<ServiceDetailPage />} />
          <Route path="/public-profile/:userId" element={<PublicProfile />} />

          {/* ── Forum (public) ───────────────────────────────────────── */}
          <Route path="/forum"                            element={<ForumCategories />} />
          <Route path="/forum/category/:slug"             element={<ForumTopicList />} />
          <Route path="/forum/topic/:topicId"             element={<ForumTopicDetail />} />

          {/* ── Onboarding ───────────────────────────────────────────── */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* ── Authenticated ────────────────────────────────────────── */}
          <Route
            path="/post-offer"
            element={<ProtectedRoute><PostOfferForm /></ProtectedRoute>}
          />
          <Route
            path="/post-need"
            element={<ProtectedRoute><PostNeedForm /></ProtectedRoute>}
          />
          <Route
            path="/messages"
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
    </>
  )
}

export default App
