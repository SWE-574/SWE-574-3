import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useEffect, useState } from 'react'
import apiClient from '@/services/api'

interface ProtectedRouteProps {
  children: React.ReactNode
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const location = useLocation()
  const [isChecking, setIsChecking] = useState(true)
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    checkAuth().then(() => setIsChecking(false))
  }, [checkAuth])

  useEffect(() => {
    if (!isChecking && isAuthenticated) {
      apiClient
        .get<{ is_onboarded?: boolean }>('/users/me/profile/')
        .then((res) => setIsOnboarded(res.data.is_onboarded ?? false))
        .catch(() => setIsOnboarded(false))
    }
  }, [isChecking, isAuthenticated])

  if (isChecking || (isAuthenticated && isOnboarded === null)) {
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

  if (!isOnboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
