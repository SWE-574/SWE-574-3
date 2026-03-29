/**
 * Feature 20 — own profile: open Followers list modal and close with header ✕.
 * Does not assert list rows or Following.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('Feature 20 — self profile followers list', () => {
  test('logged-in user can open Followers modal and close with ✕', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 })

    await page.getByTitle('View followers').click()
    await expect(page.getByText('Followers', { exact: true })).toBeVisible({ timeout: 10_000 })

    // Header row: title box + close button (Box as="button" with FiX)
    await page.getByText('Followers', { exact: true }).locator('..').locator('..').getByRole('button').click()
    await expect(page.getByText('Followers', { exact: true })).toBeHidden({ timeout: 5_000 })
  })
})
