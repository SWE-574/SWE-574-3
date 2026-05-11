import { type Page, expect } from '@playwright/test'

// ─── Demo user credentials (seeded by setup_demo.py) ─────────────────────────
const DEMO_USERS = {
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

// `regular` is the role-agnostic alias used by tests that just need any
// signed-in non-admin (e.g. the a11y baseline). Aliased to `cem` (member
// role, no admin flag) so the seed stays the source of truth.
export const USERS = {
  ...DEMO_USERS,
  regular: DEMO_USERS.cem,
} as const

export type DemoUser = (typeof USERS)[keyof typeof USERS]

/**
 * Authenticate via the REST API, then navigate to /dashboard.
 *
 * Behaviour by design:
 *  - With no `userOverrides`, the real backend serves /users/me/. Tests that
 *    mutate user state (balance, bio, evaluations…) read live data.
 *  - With `userOverrides`, /users/me/ is stubbed with a static payload so
 *    auth states the seed cannot represent (`is_verified: false`, custom
 *    onboarding flags, etc.) are simulatable. Mutation tests must not pass
 *    overrides, or they will read the frozen payload back.
 *
 * Any previous /users/me/ route (from an earlier loginAs / switchUser /
 * logout in the same Page) is cleared first so handlers don't stack.
 */
export async function loginAs(
  page: Page,
  user: DemoUser,
  /**
   * Optional overrides merged into a stubbed /users/me/ payload.
   * Use only when the seed cannot represent the auth state under test
   * (e.g. `is_verified: false`). Pass nothing when the test mutates the
   * user, so reads see live backend data.
   */
  userOverrides: Record<string, unknown> = {},
): Promise<void> {
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

  // 3. Drop any /users/me/ handler left over from a prior loginAs /
  //    switchUser / logout on this Page so the new state isn't shadowed.
  await page.unroute('**/api/users/me/').catch(() => {
    /* nothing to unroute */
  })

  // 4. Only stub /users/me/ when the test needs an auth state the seed
  //    cannot represent. Otherwise leave the route alone so the live
  //    backend serves mutated state correctly.
  if (Object.keys(userOverrides).length > 0) {
    const loginData = JSON.parse(loginResult.body)
    const userData = {
      ...loginData.user,
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

  // 5. Land on the dashboard so the navbar renders and tests can chain
  //    interactions without an extra page.goto() in every spec.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible({ timeout: 15_000 })
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
  await expect(trigger).toBeVisible({ timeout: 15_000 })
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
  // After POST /auth/logout the dashboard's hooks can race to re-fetch
  // /users/me/ before React's auth flip lands. Without a stub the real
  // backend (which still has the cookie until the response settles)
  // returns 200 with the user, useAuthStore re-hydrates, and the route
  // guard never redirects. A 401 stub closes the race deterministically.
  await page.unroute('**/api/users/me/').catch(() => {
    /* nothing to unroute */
  })
  await page.route('**/api/users/me/', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  )
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
