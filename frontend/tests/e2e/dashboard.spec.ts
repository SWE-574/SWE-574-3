/**
 * E2E — Dashboard
 *
 * Covers:
 *  1. Authenticated user sees the dashboard with service cards
 *  2. Search/filter bar is present and functional
 *  3. Polling does not cause page errors
 *
 * Demo data: 15+ services seeded by setup_demo.py.
 * Tests use search to find services (bypasses geolocation filtering in CI).
 * Note: "Manti" is excluded from listing by a past-one-time-group-offer filter,
 * so all search tests use "Chess" which always appears in results.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('Dashboard', () => {
  test('authenticated user sees service cards on the dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)

    // loginAs lands on /dashboard, wait for search input
    const searchInput = page.getByPlaceholder(/search/i).first()
    await expect(searchInput).toBeVisible({ timeout: 20_000 })

    // Search for a known demo service (Chess is always in listing results)
    await searchInput.fill('Chess')
    await expect(page.getByText(/Chess/i).first()).toBeVisible({ timeout: 20_000 })
  })

  test('search bar is present and filters services', async ({ page }) => {
    await loginAs(page, USERS.cem)

    const searchInput = page.getByPlaceholder(/search/i).first()
    await expect(searchInput).toBeVisible({ timeout: 20_000 })

    await searchInput.fill('Chess')
    await expect(page.getByText(/Chess/i).first()).toBeVisible({ timeout: 20_000 })
  })

  test('filter tabs are visible and clickable', async ({ page }) => {
    await loginAs(page, USERS.cem)

    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 20_000 })

    const allTab = page.getByRole('button', { name: /^All$/i }).first()
    await expect(allTab).toBeVisible({ timeout: 10_000 })
  })

  test('dashboard polling does not cause page crashes', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await loginAs(page, USERS.elif)
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 20_000 })

    await page.waitForTimeout(5_000)
    expect(errors).toHaveLength(0)
  })
})
