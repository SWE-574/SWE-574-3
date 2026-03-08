import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'

const mockCheckAuth = vi.fn()

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      isAuthenticated: false,
      user: null,
      checkAuth: mockCheckAuth,
    }
    return selector(state)
  },
}))

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckAuth.mockResolvedValue(undefined)
  })

  it('redirects to /login when not authenticated', async () => {
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await vi.waitFor(() => {
      expect(mockCheckAuth).toHaveBeenCalled()
    })
    await vi.waitFor(() => {
      expect(screen.getByText('Login page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })
})
