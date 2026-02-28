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
  logout: () => void
  refreshUser: () => Promise<void>
  checkAuth: (force?: boolean) => Promise<void>
  updateUserOptimistically: (updates: Partial<User>) => void
}

const saveToStorage = (user: User | null) => {
  if (user) {
    try {
      localStorage.setItem('user_data', JSON.stringify(user))
    } catch {
      // ignore storage errors
    }
  } else {
    localStorage.removeItem('user_data')
  }
}

const loadFromStorage = (): User | null => {
  try {
    const stored = localStorage.getItem('user_data')
    return stored ? (JSON.parse(stored) as User) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: loadFromStorage(),
  isAuthenticated: !!loadFromStorage(),
  isLoading: false,
  error: null,

  setUser: (user) => {
    saveToStorage(user)
    set({ user, isAuthenticated: !!user })
  },

  setError: (error) => set({ error }),

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await apiClient.post<{
        access: string
        refresh: string
        user?: User
      }>('/auth/login/', { email, password })

      localStorage.setItem('access_token', res.data.access)
      localStorage.setItem('refresh_token', res.data.refresh)

      let user = res.data.user ?? null
      if (!user) {
        const meRes = await apiClient.get<User>('/users/me/')
        user = meRes.data
      }

      saveToStorage(user)
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error) {
      set({ isLoading: false, error: getErrorMessage(error, 'Login failed') })
      throw error
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const res = await apiClient.post<{
        access: string
        refresh: string
        user?: User
      }>('/auth/register/', data)

      localStorage.setItem('access_token', res.data.access)
      localStorage.setItem('refresh_token', res.data.refresh)

      let user = res.data.user ?? null
      if (!user) {
        const meRes = await apiClient.get<User>('/users/me/')
        user = meRes.data
      }

      saveToStorage(user)
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: getErrorMessage(error, 'Registration failed'),
      })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    saveToStorage(null)
    set({ user: null, isAuthenticated: false, error: null })
  },

  refreshUser: async () => {
    try {
      const res = await apiClient.get<User>('/users/me/')
      saveToStorage(res.data)
      set({ user: res.data, isAuthenticated: true })
    } catch {
      // silently fail
    }
  },

  checkAuth: async (force = false) => {
    const state = get()
    if (!force && state.isAuthenticated && state.user) return

    const token =
      localStorage.getItem('access_token') ??
      localStorage.getItem('refresh_token')
    if (!token) {
      set({ user: null, isAuthenticated: false, isLoading: false })
      return
    }

    set({ isLoading: true })
    try {
      const res = await apiClient.get<User>('/users/me/')
      saveToStorage(res.data)
      set({ user: res.data, isAuthenticated: true, isLoading: false })
    } catch {
      saveToStorage(null)
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  updateUserOptimistically: (updates) => {
    const { user } = get()
    if (!user) return
    const updated = { ...user, ...updates }
    saveToStorage(updated)
    set({ user: updated })
  },
}))
