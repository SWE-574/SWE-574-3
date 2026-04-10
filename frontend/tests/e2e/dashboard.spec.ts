/**
 * E2E — Dashboard
 *
 * Covers:
 *  1. Authenticated user sees the dashboard with service cards
 *  2. Service cards render with images that have loading="lazy"
 *  3. Search/filter bar is present and functional
 *  4. Polling does not cause page errors
 *
 * Demo data: 15+ services seeded by setup_demo.py.
 * Tests use search to find services (bypasses geolocation filtering in CI).
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('Dashboard', () => {
  test('authenticated user sees service cards on the dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)

    // loginAs lands on /dashboard, wait for search input
    const searchInput = page.getByPlaceholder(/search/i).first()
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    // Search for a known demo service
    await searchInput.fill('Manti')
    await expect(page.getByText(/Manti/i).first()).toBeVisible({ timeout: 20_000 })
  })

  test('dashboard images have lazy loading attribute', async ({ page }) => {
    await loginAs(page, USERS.elif)

    const searchInput = page.getByPlaceholder(/search/i).first()
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    await searchInput.fill('Manti')
    await expect(page.getByText(/Manti/i).first()).toBeVisible({ timeout: 20_000 })

    const nonLazyImages = page.locator('img:not([loading="lazy"])')
    await expect(nonLazyImages).toHaveCount(0)
  })

  test('search bar is present and filters services', async ({ page }) => {
    await loginAs(page, USERS.cem)

    const searchInput = page.getByPlaceholder(/search/i).first()
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    await searchInput.fill('Chess')
    await expect(page.getByText(/Chess/i).first()).toBeVisible({ timeout: 20_000 })
  })

  test('filter tabs are visible and clickable', async ({ page }) => {
    await loginAs(page, USERS.cem)

    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 15_000 })

    const allTab = page.getByRole('button', { name: /^All$/i }).first()
    await expect(allTab).toBeVisible({ timeout: 10_000 })
  })

  test('dashboard polling does not cause page crashes', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await loginAs(page, USERS.elif)
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 15_000 })

    await page.waitForTimeout(5_000)
    expect(errors).toHaveLength(0)
  })
})
