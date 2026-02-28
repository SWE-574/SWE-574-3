import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

const API_TIMEOUT = 10000

const DEFAULT_API_URL =
  import.meta.env.MODE === 'test' ? '/api' : 'http://localhost:8000/api'
const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? DEFAULT_API_URL

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: API_TIMEOUT,
})

// ─── Token Refresh Queue ────────────────────────────────────────────────────
let isRefreshing = false
let refreshPromise: Promise<string> | null = null
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error)
    else if (token) prom.resolve(token)
  })
  failedQueue = []
}

// ─── Request Interceptor: attach JWT ────────────────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ─── Response Interceptor: auto-refresh on 401 ──────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const requestUrl: string = originalRequest?.url ?? ''

    const isAuthEndpoint = (url: string) =>
      url.includes('/auth/login/') ||
      url.includes('/auth/register/') ||
      url.includes('/auth/refresh/')

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isAuthEndpoint(requestUrl)) return Promise.reject(error)

      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) return Promise.reject(error)

      originalRequest._retry = true

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return apiClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      isRefreshing = true

      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            const res = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
              refresh: refreshToken,
            })
            const { access } = res.data
            localStorage.setItem('access_token', access)
            processQueue(null, access)
            return access
          } catch (refreshError: unknown) {
            const e = refreshError as { response?: { status?: number } }
            if ([400, 401, 500].includes(e.response?.status ?? 0)) {
              localStorage.removeItem('access_token')
              localStorage.removeItem('refresh_token')
              window.location.href = '/login?error=session_expired'
            }
            processQueue(refreshError, null)
            throw refreshError
          } finally {
            isRefreshing = false
            refreshPromise = null
          }
        })()
      }

      try {
        const newToken = await refreshPromise
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }
        return apiClient(originalRequest)
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)

// ─── Error Types ─────────────────────────────────────────────────────────────
export interface ApiErrorResponse {
  detail: string
  code: string
  field_errors?: Record<string, string[]>
  error?: string
  message?: string
  [key: string]: unknown
}

export interface ApiError extends Error {
  response?: {
    data?: ApiErrorResponse
    status?: number
  }
}

export function getErrorMessage(
  error: unknown,
  defaultMessage = 'An unexpected error occurred.',
): string {
  if (typeof error === 'string') return error

  if (error && typeof error === 'object') {
    const e = error as ApiError
    if (e.response?.data) {
      const data = e.response.data
      const detail = typeof data.detail === 'string' ? data.detail : ''

      if (data.detail && data.code) {
        if (data.field_errors && Object.keys(data.field_errors).length > 0) {
          const fieldMessages = Object.entries(data.field_errors)
            .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
            .join('. ')
          return `${data.detail} ${fieldMessages}`
        }
        return data.detail
      }

      const fieldErrors: string[] = []
      if (data.field_errors) {
        for (const [field, errors] of Object.entries(data.field_errors)) {
          if (Array.isArray(errors)) fieldErrors.push(`${field}: ${errors.join(', ')}`)
        }
      }

      if (detail && fieldErrors.length > 0) return `${detail} ${fieldErrors.join('. ')}`
      if (detail) return detail
      if (data.error) return String(data.error)
      if (data.message) return String(data.message)
      if (fieldErrors.length > 0) return fieldErrors.join('. ')
    }
    if (e.message) return e.message
  }

  return defaultMessage
}

export default apiClient
