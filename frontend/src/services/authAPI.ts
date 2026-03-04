import apiClient from './api'
import type { User } from '@/types'

export interface VerifyEmailResponse {
  detail: string
  access: string
  user: User
}

export const authAPI = {
  forgotPassword: (email: string) =>
    apiClient.post<{ detail: string }>('/auth/forgot-password/', { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post<{ detail: string }>('/auth/reset-password/', { token, password }),

  verifyEmail: (token: string) =>
    apiClient.post<VerifyEmailResponse>('/auth/verify-email/', { token }),

  resendVerification: (email: string) =>
    apiClient.post<{ detail: string }>('/auth/resend-verification/', { email }),

  sendVerification: () =>
    apiClient.post<{ detail: string }>('/auth/send-verification/'),

  logout: () =>
    apiClient.post<{ detail: string }>('/auth/logout/'),

  /** For WebSocket auth when proxy does not forward cookies (e.g. Vite dev). */
  getWsToken: () =>
    apiClient.get<{ token: string }>('/auth/ws-token/'),
}
