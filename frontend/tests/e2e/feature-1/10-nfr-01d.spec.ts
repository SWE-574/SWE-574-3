/**
 * NFR-01d — Session state shall persist across page refreshes until expiration or logout
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('NFR-01d: Session persistence across page reload', () => {
  test('authenticated session survives a full page reload on dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    await page.reload()

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page.locator('nav')).toBeVisible()
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

    // Log out via nav dropdown
    const avatar = page.locator('img[alt="avatar"]')
    if (await avatar.isVisible().catch(() => false)) {
      await avatar.click()
    } else {
      const initials = USERS.burak.name.split(' ').map(n => n[0]).join('')
      await page.locator('nav').getByText(initials).click()
    }
    await page.getByText('Log Out').click()
    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 })

    // After logout the access_token cookie must be deleted
    const cookiesAfter = await page.context().cookies()
    const hasAccessAfter = cookiesAfter.some(c => c.name === 'access_token')
    expect(hasAccessAfter).toBe(false)
  })
})
