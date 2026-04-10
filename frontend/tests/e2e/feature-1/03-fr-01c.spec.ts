/**
 * FR-01c — Logout
 *
 * A user shall be able to log out.
 * The system shall invalidate the session and redirect to a public page.
 */

import { test, expect } from '@playwright/test'
import { loginAs, logout, openUserMenu, USERS } from '../helpers/auth'

test.describe('FR-01c: Logout invalidates session and redirects', () => {
  test('logged-in user can log out via the nav dropdown', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await logout(page)
  })

  test('after logout the session cookie is cleared', async ({ page }) => {
    await loginAs(page, USERS.cem)

    await openUserMenu(page)

    // Capture the logout response to assert the backend sends a cookie-deletion header
    const [logoutResponse] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/auth/logout') && resp.request().method() === 'POST',
        { timeout: 10_000 }
      ),
      page.getByText('Log Out').click(),
    ])

    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 })

    // Backend must instruct the browser to delete the access_token cookie (Max-Age=0).
    // response.allHeaders() uses CDP ExtraInfo events and includes Set-Cookie (response.headers() does not).
    const allHeaders = await logoutResponse.allHeaders()
    const setCookieHeader = allHeaders['set-cookie'] ?? ''
    expect(setCookieHeader).toMatch(/access_token=.*[Mm]ax-[Aa]ge=0/)
  })

  test('after logout the login page is accessible (public redirect works)', async ({ page }) => {
    await loginAs(page, USERS.burak)
    await logout(page)
    await expect(page.locator('body')).toBeVisible()
  })
})
