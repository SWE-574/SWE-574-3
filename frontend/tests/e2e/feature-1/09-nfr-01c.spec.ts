/**
 * NFR-01c — Performance: login and logout shall complete within 2 seconds under normal load
 */

import { test, expect } from '@playwright/test'
import { USERS } from '../helpers/auth'

const PERF_BUDGET_MS = 2_000

test.describe('NFR-01c: Login and logout complete within 2 seconds', () => {
  test('login round-trip (submit → redirect) completes within 2 s', async ({ page }) => {
    await page.goto('/login')
    // Pre-fill so the timing only captures the submit-to-redirect window
    await page.locator('#email').fill(USERS.cem.email)
    await page.locator('#password').fill(USERS.cem.password)

    const start = Date.now()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/\/login/, { timeout: PERF_BUDGET_MS + 5_000 })
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(PERF_BUDGET_MS)
  })

  test('logout round-trip (click → redirect) completes within 2 s', async ({ page }) => {
    // Log in first
    await page.goto('/login')
    await page.locator('#email').fill(USERS.elif.email)
    await page.locator('#password').fill(USERS.elif.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    // Open avatar dropdown
    const avatar = page.locator('img[alt="avatar"]')
    if (await avatar.isVisible().catch(() => false)) {
      await avatar.click()
    } else {
      const initials = USERS.elif.name.split(' ').map(n => n[0]).join('')
      await page.locator('nav').getByText(initials).click()
    }

    const start = Date.now()
    await page.getByText('Log Out').click()
    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: PERF_BUDGET_MS + 5_000 })
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(PERF_BUDGET_MS)
  })
})
