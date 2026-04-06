/**
 * FR-01d — Route protection for authenticated and admin-only areas
 *
 * The system shall enforce route protection:
 *   - Unauthenticated → redirect to login
 *   - Non-admin on admin route → denied (redirect or 403)
 *   - Admin → admin panel accessible
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('FR-01d: Route protection (auth + RBAC)', () => {
  test('unauthenticated user cannot access any protected route', async ({ page }) => {
    // Note: /dashboard is intentionally public (unauthenticated browse). Only truly protected routes are listed.
    await page.context().clearCookies()

    const protectedRoutes = ['/profile', '/messages', '/achievements', '/notifications']
    for (const route of protectedRoutes) {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    }
  })

  test('non-admin user is denied access to /admin', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    await page.goto('/admin')

    // AdminProtectedRoute redirects non-admins to /dashboard — wait for that navigation to settle
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 10_000 })
  })

  test('admin user can access /admin panel', async ({ page }) => {
    // moderator@demo.com is the seeded superuser — not in the typed USERS map, so inline it
    await page.goto('/login')
    await page.locator('#email').fill('moderator@demo.com')
    await page.locator('#password').fill('demo123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    await page.goto('/admin')

    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 })
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
