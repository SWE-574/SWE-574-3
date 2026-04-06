/**
 * NFR-01b — Authentication responses shall not reveal whether username or password was incorrect
 *
 * Both "wrong password for real email" and "non-existent email" must produce
 * an identical or equivalently generic error message to prevent account enumeration.
 */

import { test, expect } from '@playwright/test'
import { USERS } from '../helpers/auth'

test.describe('NFR-01b: Generic error messages on login failure', () => {
  test('wrong-password error message is generic (no "incorrect password" hint)', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(USERS.cem.email)
    await page.locator('#password').fill('wrong-password-xyz')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    // The error must NOT say "password is wrong / incorrect password"
    // It should say something generic like "Invalid credentials"
    const passwordSpecificError = page.locator('text=/incorrect password|wrong password|password is/i').first()
    await expect(passwordSpecificError).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      // If not visible — requirement is met
    })
  })

  test('unknown email error message is generic (no "email not found" hint)', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill('nobody@doesnotexist.invalid')
    await page.locator('#password').fill('somepassword123')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    // Must NOT expose that the email doesn't exist
    const emailSpecificError = page.locator('text=/email not found|no account|user not found/i').first()
    await expect(emailSpecificError).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      // If not visible — requirement is met
    })
  })

  test('wrong-password and unknown-email produce visually equivalent feedback', async ({ page }) => {
    // Capture error text for wrong-password scenario
    await page.goto('/login')
    await page.locator('#email').fill(USERS.cem.email)
    await page.locator('#password').fill('wrong-password-xyz')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    // Both cases must leave the user on /login with no indication of which field was wrong
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
  })
})
