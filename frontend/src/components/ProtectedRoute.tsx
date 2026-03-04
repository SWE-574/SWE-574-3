import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useEffect, useState } from 'react'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** If true, skip the onboarding redirect (used for the /onboarding route itself) */
  skipOnboardingCheck?: boolean
}

const ProtectedRoute = ({ children, skipOnboardingCheck = false }: ProtectedRouteProps) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const location = useLocation()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    checkAuth().then(() => setIsChecking(false))
  }, [checkAuth])

  if (isChecking) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <div className="spinner" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Redirect non-onboarded users to the onboarding wizard
  // skipOnboardingCheck=true on the /onboarding route itself to avoid infinite loop
  if (!skipOnboardingCheck && user && user.is_onboarded === false) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
