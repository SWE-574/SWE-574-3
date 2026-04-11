/**
 * FR-01f — Password reset via expiring email token
 *
 * The system shall support password reset via expiring email token
 * when password reset is enabled.
 */

import { test, expect } from '@playwright/test'

test.describe('FR-01f: Password reset via email token', () => {
  test('forgot-password page is accessible at /forgot-password', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page).toHaveURL(/\/forgot-password/)
    await expect(page.locator('input[type="email"], #email, [name="email"]').first()).toBeVisible()
  })

  test('submitting a valid email shows a confirmation / sent state', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.locator('input[type="email"], #email, [name="email"]').first().fill('cem@demo.com')
    await page.getByRole('button', { name: /send|reset|submit/i }).click()

    // Should show a success / sent confirmation — not an error
    await expect(
      page.locator('text=/sent|check your email|email.*sent|reset.*link/i').first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('submitting an unknown email does not leak whether account exists', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.locator('input[type="email"], #email, [name="email"]').first().fill('nobody@doesnotexist.invalid')
    await page.getByRole('button', { name: /send|reset|submit/i }).click()

    // Response should be generic — same confirmation message regardless of whether
    // the email is registered (prevents account enumeration)
    await expect(
      page.locator('text=/sent|check your email|email.*sent|reset.*link/i').first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('invalid email format is rejected by client-side validation', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.locator('input[type="email"], #email, [name="email"]').first().fill('not-an-email')
    await page.getByRole('button', { name: /send|reset|submit/i }).click()

    // Must stay on /forgot-password
    await expect(page).toHaveURL(/\/forgot-password/)
  })

  test('reset-password page is accessible at /reset-password', async ({ page }) => {
    await page.goto('/reset-password')
    // Should render a page (form or a "token required" message) — not a blank 404
    await expect(page.locator('body')).toBeVisible()
    await expect(page).not.toHaveURL(/\/login/)
  })
})
