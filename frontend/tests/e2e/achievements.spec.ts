/**
 * E2E — Achievements
 *
 * Covers: protected route, achievement/badge cards or empty state.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('Achievements', () => {
  test('/achievements is protected; unauthenticated → /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/achievements')

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('logged-in user sees achievements page (cards or empty state)', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/achievements')

    await expect(page).toHaveURL(/\/achievements/, { timeout: 15_000 })
    const headerOrCards =
      page.getByText(/Achievements|Unlocked|Earned|badge|rozet/i).first()
    await expect(headerOrCards).toBeVisible({ timeout: 10_000 })
  })
})
