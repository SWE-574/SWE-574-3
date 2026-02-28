import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useEffect, useState } from 'react'

interface AdminProtectedRouteProps {
  children: React.ReactNode
}

const AdminProtectedRoute = ({ children }: AdminProtectedRouteProps) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const checkAuth = useAuthStore((s) => s.checkAuth)
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

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!user?.is_admin) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}

export default AdminProtectedRoute
