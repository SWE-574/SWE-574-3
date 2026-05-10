import { type Page, expect } from '@playwright/test'

import { type DemoUser } from './auth'

/**
 * API-only login fixture for multi-user chains.
 *
 * Why this exists alongside `loginAs`:
 *  - `loginAs` does `page.goto('/login')` + `page.goto('/dashboard')` and waits
 *    on the navbar trigger every call. For specs that switch identities 4–6
 *    times (events handshake setup, group exchange traversal) the cumulative
 *    navigation time pushes the spec past its 60s budget on cold CI workers.
 *  - This helper performs the JWT exchange via `page.request` (no browser
 *    navigation), pushes the access cookie onto the browser context, and
 *    primes the in-memory `useAuthStore` user via a `**/api/users/me/**`
 *    route stub so the React tree behaves identically to a real login.
 *  - A module-scoped JWT cache means repeated `loginAsApi(cem)` calls in the
 *    same worker only authenticate once.
 *
 * Trade-offs:
 *  - Tests that exercise the login form itself must keep using `loginAs`
 *    (or `loginViaUI`). This helper bypasses the form on purpose.
 *  - The /users/me/ stub mirrors the live profile by passing through the
 *    payload returned from /auth/login/, with `is_active`, `is_verified`,
 *    and `is_onboarded` defaulted to true. Override with `userOverrides` if
 *    a spec needs a different auth shape (mirroring `loginAs`).
 */

interface CachedAuth {
  accessCookie: { name: string; value: string; path: string }
  refreshCookie: { name: string; value: string; path: string } | null
  userPayload: Record<string, unknown>
}

const authCache = new Map<string, CachedAuth>()

function parseSetCookie(rawHeader: string | undefined, cookieName: string): string | null {
  if (!rawHeader) return null
  // Set-Cookie header may be a single string with multiple cookies separated
  // by newlines (Playwright concatenates), or just one cookie.
  const lines = rawHeader.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith(`${cookieName}=`)) continue
    const semi = trimmed.indexOf(';')
    const pair = semi === -1 ? trimmed : trimmed.slice(0, semi)
    const eq = pair.indexOf('=')
    return eq === -1 ? null : pair.slice(eq + 1)
  }
  return null
}

async function authenticate(
  page: Page,
  user: DemoUser,
): Promise<CachedAuth> {
  const cached = authCache.get(user.email)
  if (cached) return cached

  // Resolve the API origin — mirror what `loginAs` relies on (the page's
  // current baseURL routes /api/* to the backend via the same proxy).
  const baseURL = (page.context().request as unknown as { _options?: { baseURL?: string } })._options?.baseURL
    ?? page.url().match(/^https?:\/\/[^/]+/)?.[0]
    ?? 'http://localhost'

  const response = await page.request.post(`${baseURL}/api/auth/login/`, {
    data: { email: user.email, password: user.password },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(response.ok(), `API login failed (${response.status()}): ${await response.text()}`).toBeTruthy()

  const body = await response.json() as { user?: Record<string, unknown>; access?: string; refresh?: string }
  const headers = response.headers()
  const rawSetCookie = headers['set-cookie'] ?? headers['Set-Cookie']

  const accessValue = parseSetCookie(rawSetCookie, 'access_token')
    ?? (typeof body.access === 'string' ? body.access : null)
  expect(accessValue, 'API login response did not include an access token').toBeTruthy()

  const refreshValue = parseSetCookie(rawSetCookie, 'refresh_token')
    ?? (typeof body.refresh === 'string' ? body.refresh : null)

  const userPayload = body.user ?? {}

  const auth: CachedAuth = {
    accessCookie: { name: 'access_token', value: accessValue!, path: '/' },
    refreshCookie: refreshValue ? { name: 'refresh_token', value: refreshValue, path: '/' } : null,
    userPayload,
  }
  authCache.set(user.email, auth)
  return auth
}

/**
 * Drop the cached JWTs for a given user, forcing the next loginAsApi to
 * re-authenticate. Useful in afterEach hooks that mutate user state in
 * ways the cached payload does not reflect.
 */
export function clearLoginAsApiCache(email?: string): void {
  if (email) {
    authCache.delete(email)
  } else {
    authCache.clear()
  }
}

/**
 * Authenticate via the REST API and seat the resulting cookies on the
 * browser context. Mirrors `loginAs` semantics:
 *  - clears any prior /users/me/ route stub
 *  - lands on /dashboard so the navbar renders
 *  - asserts the user-menu trigger appears (proof the auth store hydrated)
 *
 * Pass `userOverrides` only when the seed cannot represent the auth state
 * under test (matches the `loginAs` contract).
 */
export async function loginAsApi(
  page: Page,
  user: DemoUser,
  userOverrides: Record<string, unknown> = {},
): Promise<void> {
  const auth = await authenticate(page, user)

  // Clear any previous /users/me/ handler so a stale identity doesn't shadow
  // the new one (matches loginAs / switchUser behaviour).
  await page.unroute('**/api/users/me/').catch(() => {
    /* nothing to unroute */
  })

  // Seat the access (and refresh, if available) cookie on the context. The
  // backend already accepts the access_token cookie for JWT auth, so this
  // is functionally identical to a successful form login.
  const origin = page.url().match(/^https?:\/\/[^/]+/)?.[0] ?? 'http://localhost'
  const url = new URL(origin)
  const cookies = [
    { ...auth.accessCookie, domain: url.hostname, secure: false, httpOnly: true, sameSite: 'Lax' as const },
  ]
  if (auth.refreshCookie) {
    cookies.push({
      ...auth.refreshCookie,
      domain: url.hostname,
      secure: false,
      httpOnly: true,
      sameSite: 'Lax' as const,
    })
  }
  await page.context().addCookies(cookies)

  // Match loginAs semantics: only install a /users/me/ stub when the
  // caller passes overrides. Specs that read live user state (balances,
  // bio mutations, evaluation flags) must not be shadowed by a frozen
  // payload, so the default path leaves /users/me/ alone.
  if (Object.keys(userOverrides).length > 0) {
    const userData = {
      ...auth.userPayload,
      is_onboarded: true,
      is_admin: false,
      is_active: true,
      is_verified: true,
      ...userOverrides,
    }
    await page.route('**/api/users/me/', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(userData),
        })
      } else {
        await route.continue()
      }
    })
  }

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible({ timeout: 15_000 })
}

/**
 * Drop-in replacement for `switchUser` that uses the API fixture. Clears
 * cookies + storage + /users/me/ stub, then logs the new user in via
 * `loginAsApi` (no form navigation).
 */
export async function switchUserApi(page: Page, user: DemoUser): Promise<void> {
  await page.context().clearCookies()
  if (/^https?:\/\//.test(page.url())) {
    await page.evaluate(() => {
      try {
        window.localStorage.clear()
        window.sessionStorage.clear()
      } catch {
        // Same justification as session.ts: swallow cross-origin / about:blank
        // storage access errors and continue with a fresh login.
      }
    })
  }
  await page.unroute('**/api/users/me/').catch(() => {
    /* nothing to unroute */
  })
  await loginAsApi(page, user)
}
