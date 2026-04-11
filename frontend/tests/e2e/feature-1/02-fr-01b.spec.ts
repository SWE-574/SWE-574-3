/**
 * FR-01b — Session creation and return-path redirect
 *
 * Upon successful login the system shall create an authenticated session
 * (cookie/JWT) and redirect to the requested route or default landing page.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('FR-01b: Session creation and redirect on login', () => {
  test('after login user is redirected to the default landing page (dashboard)', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    await expect(page.getByTestId('user-menu-trigger')).toBeVisible()
  })

  test('unauthenticated visit to a protected route redirects to login', async ({ page }) => {
    // /dashboard is intentionally public (unauthenticated browse). Use /profile which is protected.
    await page.context().clearCookies()
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('unauthenticated visit to /profile redirects to login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('unauthenticated visit to /messages redirects to login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/messages')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })
})
