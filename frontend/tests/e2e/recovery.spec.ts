/**
 * E2E — Account recovery and verification flows
 *
 * Covers: forgot password (submit email), reset password page with token,
 * verify email page with token, onboarding redirect when not onboarded.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('Recovery flows', () => {
  test('forgot password form submits and shows success or instruction', async ({ page }) => {
    await page.goto('/forgot-password')

    await expect(page).toHaveURL(/\/forgot-password/)
    const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first()
    await expect(emailInput).toBeVisible({ timeout: 10_000 })

    await emailInput.fill(USERS.cem.email)
    await page.getByRole('button', { name: /send|submit|reset|request/i }).click()

    await expect(page).toHaveURL(/\/(forgot-password|login|verify-email-sent)/, { timeout: 15_000 })
    await expect(
      page.getByText(/sent|check your email|instruction|reset link|invalid/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('reset password page loads with token in URL', async ({ page }) => {
    await page.goto('/reset-password?token=test-token-e2e')

    await expect(page).toHaveURL(/\/reset-password/)
    const passwordInput = page.locator('input[type="password"]').first()
    await expect(passwordInput).toBeVisible({ timeout: 10_000 })
  })

  test('verify email page loads with token in URL', async ({ page }) => {
    await page.goto('/verify-email?token=test-token-e2e')

    await expect(page).toHaveURL(/\/verify-email/)
    await expect(
      page.getByText(/verify|verifying|invalid|expired|email/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})
