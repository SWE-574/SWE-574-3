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
 * This is far more reliable in CI than filling the login form because it
 * skips form rendering, button clicks, React state propagation, and the
 * redirect chain.  The POST sets httponly auth cookies; after that we
 * simply load the dashboard as a fresh page navigation.
 */
export async function loginAs(page: Page, user: DemoUser): Promise<void> {
  // 1. Ensure we have a page loaded on the app origin so cookies can be set.
  //    Use the login page — it's lightweight and always available.
  await page.goto('/login', { waitUntil: 'commit' })

  // 2. Authenticate via API — this sets httponly access_token & refresh_token cookies.
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

  // 3. Navigate to dashboard — cookies are set, so the app will recognise the session.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  // 4. Wait for the authenticated shell to render (proves auth state is hydrated).
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible({ timeout: 30_000 })
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
