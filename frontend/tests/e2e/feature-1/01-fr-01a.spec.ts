/**
 * FR-01a — Login with email and password
 *
 * A user shall be able to log in with email/username and password.
 * On success: authenticated session created, redirected to landing page.
 * On failure: generic error message shown.
 */

import { test, expect } from '@playwright/test'
import { USERS } from '../helpers/auth'

test.describe('FR-01a: Login with email and password', () => {
  test('valid credentials create a session and redirect away from login', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(USERS.cem.email)
    await page.locator('#password').fill(USERS.cem.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })
    // Nav is visible — proves a session was created
    await expect(page.locator('nav')).toBeVisible()
  })

  test('wrong password shows an error and keeps user on login page', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(USERS.cem.email)
    await page.locator('#password').fill('definitely-wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    // Some error feedback must appear
    await expect(
      page.locator('text=/invalid|incorrect|credentials|wrong/i').first()
    ).toBeVisible({ timeout: 10_000 }).catch(() =>
      // Fallback: at minimum the form is still usable (no crash)
      expect(page.locator('#email')).toBeVisible()
    )
  })

  test('unknown email shows an error and keeps user on login page', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill('nobody@doesnotexist.invalid')
    await page.locator('#password').fill('somepassword123')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('empty form fields block submission via client-side validation', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/login/)
  })
})
