/**
 * E2E — Admin moderation
 *
 * Covers: admin dashboard/reports for admin user, non-admin redirected from /admin.
 * Demo admin: moderator@demo.com / demo123 (from setup_demo.py).
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

const ADMIN = { email: 'moderator@demo.com', password: 'demo123', name: 'Moderator' }

test.describe('Admin', () => {
  test('admin user can open admin dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(ADMIN.email)
    await page.locator('#password').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 })
    await expect(
      page.getByText(/report|dashboard|admin|moderation/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('non-admin user is redirected from /admin to dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  })
})
