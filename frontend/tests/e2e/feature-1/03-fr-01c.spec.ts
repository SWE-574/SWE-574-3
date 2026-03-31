/**
 * FR-01c — Logout
 *
 * A user shall be able to log out.
 * The system shall invalidate the session and redirect to a public page.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('FR-01c: Logout invalidates session and redirects', () => {
  test('logged-in user can log out via the nav dropdown', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    // Open avatar / user dropdown
    const avatar = page.locator('img[alt="avatar"]')
    if (await avatar.isVisible().catch(() => false)) {
      await avatar.click()
    } else {
      const initials = USERS.elif.name.split(' ').map(n => n[0]).join('')
      await page.locator('nav').getByText(initials).click()
    }
    await page.getByText('Log Out').click()

    // Redirected away from the dashboard (public or login page)
    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 })
  })

  test('after logout the session cookie is cleared', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    const avatar = page.locator('img[alt="avatar"]')
    if (await avatar.isVisible().catch(() => false)) {
      await avatar.click()
    } else {
      const initials = USERS.cem.name.split(' ').map(n => n[0]).join('')
      await page.locator('nav').getByText(initials).click()
    }
    await page.getByText('Log Out').click()
    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 })

    // The access_token cookie must be deleted by logout — directly verify the session is invalidated
    const cookies = await page.context().cookies()
    const accessToken = cookies.find(c => c.name === 'access_token')
    expect(accessToken).toBeUndefined()
  })

  test('after logout the login page is accessible (public redirect works)', async ({ page }) => {
    await loginAs(page, USERS.burak)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    const avatar = page.locator('img[alt="avatar"]')
    if (await avatar.isVisible().catch(() => false)) {
      await avatar.click()
    } else {
      const initials = USERS.burak.name.split(' ').map(n => n[0]).join('')
      await page.locator('nav').getByText(initials).click()
    }
    await page.getByText('Log Out').click()

    // Should land on a public page (home or login)
    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 })
    await expect(page.locator('body')).toBeVisible()
  })
})
