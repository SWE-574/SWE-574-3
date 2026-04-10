import { type Page, expect } from '@playwright/test'

// ─── Demo user credentials (seeded by setup_demo.py) ─────────────────────────
export const USERS = {
  elif:   { email: 'elif@demo.com',   password: 'demo123', name: 'Elif Yılmaz' },
  cem:    { email: 'cem@demo.com',    password: 'demo123', name: 'Cem Demir'   },
  ayse:   { email: 'ayse@demo.com',   password: 'demo123', name: 'Ayşe Kaya'   },
  mehmet: { email: 'mehmet@demo.com', password: 'demo123', name: 'Mehmet Özkan' },
  zeynep: { email: 'zeynep@demo.com', password: 'demo123', name: 'Zeynep Arslan' },
  can:    { email: 'can@demo.com',    password: 'demo123', name: 'Can Şahin'   },
  deniz:  { email: 'deniz@demo.com',  password: 'demo123', name: 'Deniz Aydın' },
  burak:  { email: 'burak@demo.com',  password: 'demo123', name: 'Burak Kurt'  },
  yasemin:{ email: 'yasemin@demo.com',password: 'demo123', name: 'Yasemin Ergin' },
} as const

export type DemoUser = (typeof USERS)[keyof typeof USERS]

/**
 * Authenticate via the REST API, then navigate to /dashboard.
 *
 * After the POST /auth/login/ call sets httponly cookies and returns user
 * data, we intercept the first /users/me/ request so React's checkAuth()
 * resolves instantly instead of waiting for the (potentially slow) backend.
 * This prevents the "Loading…" spinner from blocking the test when
 * multiple workers are hitting the backend simultaneously.
 */
export async function loginAs(page: Page, user: DemoUser): Promise<void> {
  // 1. Load a page on the app origin so cookies can be set.
  await page.goto('/login', { waitUntil: 'commit' })

  // 2. Authenticate via API — sets httponly cookies and returns user data.
  const loginResult = await page.evaluate(
    async (creds) => {
      const res = await fetch('/api/auth/login/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      })
      return { ok: res.ok, status: res.status, body: await res.text() }
    },
    { email: user.email, password: user.password },
  )
  expect(loginResult.ok, `API login failed (${loginResult.status}): ${loginResult.body}`).toBeTruthy()

  // 3. Extract the user payload returned by the login endpoint and add
  //    fields that /users/me/ normally includes but the login response omits.
  const loginData = JSON.parse(loginResult.body)
  const userData = {
    ...loginData.user,
    is_onboarded: true,
    is_admin: false,
    is_active: true,
    is_verified: true,
  }

  // 4. Intercept the first /users/me/ call so checkAuth() resolves instantly.
  //    Without this, the React app shows a "Loading…" spinner while waiting
  //    for /users/me/ from the (slow-under-load) backend.
  let intercepted = false
  await page.route('**/api/users/me/', async (route) => {
    if (!intercepted && route.request().method() === 'GET') {
      intercepted = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(userData),
      })
    } else {
      await route.continue()
    }
  })

  // 5. Navigate to dashboard — auth cookies are set, /users/me/ will resolve
  //    instantly from the intercepted route, so the navbar renders fast.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible({ timeout: 15_000 })

  // 6. Remove the interception so subsequent /users/me/ calls go to the
  //    real backend (important for tests that modify user state).
  await page.unroute('**/api/users/me/')
}

/**
 * Log in using the UI form (fill + click).
 * Use this ONLY for tests that specifically verify the login flow.
 */
export async function loginViaUI(page: Page, user: DemoUser): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(user.email)
  await page.locator('#password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible({ timeout: 30_000 })
}

/**
 * Open the user dropdown menu in the desktop navbar.
 * Works regardless of whether the user has an avatar image or initials.
 */
export async function openUserMenu(page: Page): Promise<void> {
  const trigger = page.getByTestId('user-menu-trigger')
  await expect(trigger).toBeVisible({ timeout: 10_000 })
  await trigger.click()
  // Wait for the dropdown to open (Log Out item becomes visible)
  await expect(page.getByText('Log Out')).toBeVisible({ timeout: 5_000 })
}

/**
 * Log the current user out via the navbar dropdown.
 * Resolves once the page has left the dashboard.
 */
export async function logout(page: Page): Promise<void> {
  await openUserMenu(page)
  await page.getByText('Log Out').click()
  await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 })
}

/**
 * Wait for a toast notification containing the given text.
 */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  // Sonner toasts are rendered in a <li> inside [data-sonner-toaster]
  const toast = page.locator('[data-sonner-toaster] li').filter({ hasText: text })
  await expect(toast.first()).toBeVisible({ timeout: 10_000 })
}
