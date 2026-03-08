/**
 * E2E — Transaction History (Time Activity)
 *
 * Covers: protected route, Time Available/balance, filters, list or empty state.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('Transaction History', () => {
  test('/transaction-history is protected; unauthenticated → /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/transaction-history')

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('logged-in user sees Time Activity page with summary', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/transaction-history')

    await expect(page).toHaveURL(/\/transaction-history/, { timeout: 15_000 })
    await expect(
      page.getByText(/Time Activity|Time Available|Time Received|Time Shared/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('filter chips or tabs visible', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/transaction-history')

    const allOrReceived = page.getByRole('button', { name: /All|Received|Shared/i }).first()
    await expect(allOrReceived).toBeVisible({ timeout: 10_000 })
  })

  test('list or empty state visible', async ({ page }) => {
    await loginAs(page, USERS.ayse)
    await page.goto('/transaction-history')

    const listOrEmpty =
      page.getByText(/Date|Counterpart|No activity|Time Available|Time Activity/i).first()
    await expect(listOrEmpty).toBeVisible({ timeout: 10_000 })
  })
})
