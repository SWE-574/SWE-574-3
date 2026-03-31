/**
 * NFR-01a — Password security: passwords shall not be stored or exposed in plaintext
 *
 * Verifiable via E2E: API responses must never return a password field in any
 * user-related endpoint (profile, login, registration).
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('NFR-01a: Passwords not exposed in API responses', () => {
  test('login response does not contain a plaintext password field', async ({ page }) => {
    const passwordLeak = { found: false }

    page.on('response', async (response) => {
      if (response.url().includes('/api/auth/login') && response.request().method() === 'POST') {
        try {
          const body = await response.json()
          if (body?.password || body?.user?.password) {
            passwordLeak.found = true
          }
        } catch {
          // Non-JSON response — safe
        }
      }
    })

    await loginAs(page, USERS.cem)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })

    expect(passwordLeak.found).toBe(false)
  })

  test('user profile API response does not expose a password field', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })

    const response = await page.request.get('/api/users/me/')
    const body = await response.json()

    // /api/users/me/ returns the user object directly (not wrapped in { user: {...} })
    expect(body).not.toHaveProperty('password')
  })

  test('registration response does not echo back the password', async ({ page }) => {
    const passwordLeak = { found: false }

    page.on('response', async (response) => {
      if (response.url().includes('/api/auth/register') && response.request().method() === 'POST') {
        try {
          const body = await response.json()
          if (body?.password || body?.user?.password) {
            passwordLeak.found = true
          }
        } catch {
          // Non-JSON — safe
        }
      }
    })

    const unique = `nfr01a_${Date.now()}@test.invalid`
    await page.goto('/register')

    await page.locator('input[name="first_name"], #first_name').first().fill('NFR')
    await page.locator('input[name="last_name"], #last_name').first().fill('Test')
    await page.locator('input[type="email"], #email, [name="email"]').first().fill(unique)
    await page.locator('input[type="password"], [name="password"]').first().fill('TestPass123')
    const confirm = page.locator('[name="confirmPassword"], #confirmPassword').first()
    if (await confirm.isVisible().catch(() => false)) await confirm.fill('TestPass123')

    // Chakra UI v3 Checkbox — click the <label> to trigger the react-hook-form Controller
    await page.locator('label[for="agreeToTerms"]').click()

    await page.getByRole('button', { name: /sign up|register|create/i }).click()

    // Wait for the register API response to be processed
    await page.waitForTimeout(2_000)

    expect(passwordLeak.found).toBe(false)
  })
})
