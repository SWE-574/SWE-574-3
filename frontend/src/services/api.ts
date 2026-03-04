import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

const API_TIMEOUT = 10000

// Always use relative /api so requests go through the Vite proxy in dev
// and through Nginx in production.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// Exact paths that are publicly accessible — no redirect to /login on auth loss.
const PUBLIC_EXACT_PATHS = new Set([
  '/', '/login', '/register',
  '/forgot-password', '/reset-password',
  '/verify-email', '/verify-email-sent',
  '/dashboard',   // public browse
  '/forum',       // forum listing
])
// Path prefixes that are also public (dynamic routes)
const PUBLIC_PREFIX_PATHS = [
  '/service-detail/',
  '/public-profile/',
  '/forum/',
]
const isPublicPath = () => {
  const p = window.location.pathname
  return PUBLIC_EXACT_PATHS.has(p) || PUBLIC_PREFIX_PATHS.some((prefix) => p.startsWith(prefix))
}


export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: API_TIMEOUT,
  withCredentials: true, // send cookies with every request
})

// ─── Token Refresh Queue ────────────────────────────────────────────────────
let isRefreshing = false
let refreshPromise: Promise<void> | null = null
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (error: unknown) => void
}> = []

const processQueue = (error: unknown) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error)
    else prom.resolve()
  })
  failedQueue = []
}

// ─── Request Interceptor ─────────────────────────────────────────────────────
// Auth is handled exclusively via cookies (CookieJWTAuthentication on the backend).
// Do NOT attach Authorization header — stale cookies in the header would cause
// JWTAuthentication to raise AuthenticationFailed on public endpoints like /register.
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => config,
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
      url.includes('/auth/refresh/') ||
      url.includes('/auth/logout/')

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isAuthEndpoint(requestUrl)) return Promise.reject(error)

      // Check if we have a refresh_token cookie (httponly, can't read value but presence check via request)
      originalRequest._retry = true

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err))
      }

      isRefreshing = true

      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            // Backend reads refresh_token cookie, returns new access_token cookie
            await axios.post(
              `${API_BASE_URL}/auth/refresh/`,
              {},
              { withCredentials: true },
            )
            processQueue(null)
          } catch (refreshError: unknown) {
            processQueue(refreshError)
            const e = refreshError as { response?: { status?: number } }
            // Only redirect if refresh definitively failed AND user is on a protected page.
            // Never redirect on public pages — that causes an infinite reload loop.
            if (
              [400, 401, 403].includes(e.response?.status ?? 0) &&
              !isPublicPath()
            ) {
              window.location.href = '/login?error=session_expired'
            }
            throw refreshError
          } finally {
            isRefreshing = false
            refreshPromise = null
          }
        })()
      }

      try {
        await refreshPromise
        // New access_token cookie is now set — just retry, cookie is sent automatically
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

      // DRF field validation errors: { email: ["..."], password: ["..."] }
      // (no 'detail' key, just field→string[] pairs)
      if (typeof data === 'object' && !Array.isArray(data)) {
        const knownTopKeys = new Set(['detail', 'code', 'field_errors', 'error', 'message', 'messages'])
        const fieldKeys = Object.keys(data).filter((k) => !knownTopKeys.has(k))
        const inlineFieldErrors = fieldKeys
          .map((k) => {
            const v = (data as Record<string, unknown>)[k]
            if (Array.isArray(v)) return v.join(', ')
            if (typeof v === 'string') return v
            return null
          })
          .filter(Boolean) as string[]

        // detail is present — primary message
        const detail = typeof data.detail === 'string' ? data.detail : ''

        // field_errors from our own error format
        const fieldErrors: string[] = []
        if (data.field_errors) {
          for (const [, errors] of Object.entries(data.field_errors)) {
            if (Array.isArray(errors)) fieldErrors.push(errors.join(', '))
          }
        }

        // Combine all available field messages
        const allFieldErrors = [...inlineFieldErrors, ...fieldErrors]

        if (detail) return allFieldErrors.length ? `${detail}: ${allFieldErrors.join('. ')}` : detail
        if (allFieldErrors.length) return allFieldErrors.join('. ')
        if (data.error) return String(data.error)
        if (data.message) return String(data.message)
      }

      // DRF token/auth errors: { detail: "...", code: "...", messages: [...] }
      if (typeof data.detail === 'string') return data.detail
    }
    if (e.message) return e.message
  }

  return defaultMessage
}

export default apiClient
