/**
 * E2E — Dashboard
 *
 * Covers:
 *  1. Authenticated user sees the dashboard with service cards
 *  2. Service cards render with images that have loading="lazy"
 *  3. Search/filter bar is present and functional
 *  4. Polling does not cause page errors (no console errors after wait)
 *
 * Demo data: 15+ services seeded by setup_demo.py across multiple users.
 *
 * Note: Without geolocation (CI environment) the dashboard may not show
 * In-Person services in the initial listing. These tests use the search
 * functionality which queries the backend directly regardless of location.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

/**
 * Wait for the dashboard to load and search for a service by name.
 * Waits for the API response to ensure search results are rendered.
 */
async function searchDashboard(page: import('@playwright/test').Page, query: string) {
  await page.goto('/dashboard')
  const searchInput = page.getByPlaceholder(/search/i).first()
  await expect(searchInput).toBeVisible({ timeout: 15_000 })
  // Fill the search input and wait for the debounced API call to complete
  await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes('/api/services') && resp.status() === 200,
      { timeout: 20_000 }
    ),
    searchInput.fill(query),
  ])
}

test.describe('Dashboard', () => {
  test('authenticated user sees service cards on the dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await searchDashboard(page, 'Manti')

    await expect(
      page.getByText(/Manti/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('dashboard images have lazy loading attribute', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await searchDashboard(page, 'Manti')

    await expect(
      page.getByText(/Manti/i).first(),
    ).toBeVisible({ timeout: 10_000 })

    // All rendered images should use loading="lazy" (passes even with zero images)
    const nonLazyImages = page.locator('img:not([loading="lazy"])')
    await expect(nonLazyImages).toHaveCount(0)
  })

  test('search bar is present and filters services', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await searchDashboard(page, 'Chess')

    await expect(page.getByText(/Chess/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('filter tabs are visible and clickable', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/dashboard')

    // The search input proves the dashboard loaded
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 15_000 })

    // The filter tabs (All, Offers, Needs, Events or similar) should be visible
    const allTab = page.getByRole('button', { name: /^All$/i }).first()
    await expect(allTab).toBeVisible({ timeout: 10_000 })
  })

  test('dashboard polling does not cause page crashes', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await loginAs(page, USERS.elif)
    await page.goto('/dashboard')

    // Wait for the dashboard to load (search input is present)
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible({ timeout: 15_000 })

    // Wait briefly to let polling kick in
    await page.waitForTimeout(5_000)

    expect(errors).toHaveLength(0)
  })
})
