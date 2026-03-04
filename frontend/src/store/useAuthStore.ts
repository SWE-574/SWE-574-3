import { create } from 'zustand'
import type { User } from '@/types'
import apiClient, { getErrorMessage } from '@/services/api'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  setUser: (user: User | null) => void
  setError: (error: string | null) => void

  login: (email: string, password: string) => Promise<void>
  register: (data: {
    email: string
    password: string
    first_name: string
    last_name: string
  }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  checkAuth: (force?: boolean) => Promise<void>
  updateUserOptimistically: (updates: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  // Start with no user — always verify via cookie on mount
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  setError: (error) => set({ error }),

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      // Backend sets access_token + refresh_token cookies in the response
      const res = await apiClient.post<{
        access: string
        refresh: string
        user?: User
      }>('/auth/login/', { email, password })

      let user = res.data.user ?? null
      if (!user) {
        const meRes = await apiClient.get<User>('/users/me/')
        user = meRes.data
      }

      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error) {
      set({ isLoading: false, error: getErrorMessage(error, 'Login failed') })
      throw error
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null })
    try {
      // Backend sets cookies and returns user
      const res = await apiClient.post<{
        access: string
        refresh: string
        user?: User
      }>('/auth/register/', data)

      let user = res.data.user ?? null
      if (!user) {
        const meRes = await apiClient.get<User>('/users/me/')
        user = meRes.data
      }

      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: getErrorMessage(error, 'Registration failed'),
      })
      throw error
    }
  },

  logout: async () => {
    try {
      // Ask backend to clear httponly refresh_token cookie
      await apiClient.post('/auth/logout/')
    } catch {
      // Ignore errors — clear state regardless
    }
    set({ user: null, isAuthenticated: false, error: null })
  },

  refreshUser: async () => {
    try {
      const res = await apiClient.get<User>('/users/me/')
      set({ user: res.data, isAuthenticated: true })
    } catch {
      // Silently fail — if cookie is gone the 401 handler will redirect
    }
  },

  checkAuth: async (force = false) => {
    const state = get()
    // Skip if already verified and not forced
    if (!force && state.isAuthenticated && state.user) return

    set({ isLoading: true })
    try {
      const res = await apiClient.get<User>('/users/me/')
      set({ user: res.data, isAuthenticated: true, isLoading: false })
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  updateUserOptimistically: (updates) => {
    const { user } = get()
    if (!user) return
    set({ user: { ...user, ...updates } })
  },
}))
