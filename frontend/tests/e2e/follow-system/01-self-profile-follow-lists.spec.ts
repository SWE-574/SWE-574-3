/**
 * Feature 20 — own profile: open Following list modal and close with header ✕.
 * Does not assert list rows or Followers.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('Feature 20 — self profile follow lists', () => {
  test('logged-in user can open Following modal and close with ✕', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 })

    await page.getByTitle('View following').click()
    await expect(page.getByText('Following', { exact: true })).toBeVisible({ timeout: 10_000 })

    // Header row: title box + close button (Box as="button" with FiX)
    await page.getByText('Following', { exact: true }).locator('..').locator('..').getByRole('button').click()
    await expect(page.getByText('Following', { exact: true })).toBeHidden({ timeout: 5_000 })
  })
})
