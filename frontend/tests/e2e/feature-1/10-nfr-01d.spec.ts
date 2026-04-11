/**
 * NFR-01d — Session state shall persist across page refreshes until expiration or logout
 */

import { test, expect } from '@playwright/test'
import { loginAs, openUserMenu, USERS } from '../helpers/auth'

test.describe('NFR-01d: Session persistence across page reload', () => {
  test('authenticated session survives a full page reload on dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    await page.reload()

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByTestId('user-menu-trigger')).toBeVisible({ timeout: 15_000 })
  })

  test('session persists when navigating to another protected route then reloading', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    await page.goto('/profile')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    await page.reload()

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('session is gone after logout — auth cookies are cleared', async ({ page }) => {
    await loginAs(page, USERS.burak)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    // Confirm session cookies exist before logout
    const cookiesBefore = await page.context().cookies()
    const hasAccessBefore = cookiesBefore.some(c => c.name === 'access_token')
    expect(hasAccessBefore).toBe(true)

    // Log out via nav dropdown, capturing the logout response
    await openUserMenu(page)

    const [logoutResponse] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/auth/logout') && resp.request().method() === 'POST',
        { timeout: 10_000 }
      ),
      page.getByText('Log Out').click(),
    ])

    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 })

    // Backend must send a cookie-deletion Set-Cookie header (Max-Age=0).
    // allHeaders() uses CDP ExtraInfo events and includes Set-Cookie (headers() does not).
    const allHeaders = await logoutResponse.allHeaders()
    const setCookieHeader = allHeaders['set-cookie'] ?? ''
    expect(setCookieHeader).toMatch(/access_token=.*[Mm]ax-[Aa]ge=0/)
  })
})
