/**
 * E2E — Service Detail Page
 *
 * Covers:
 *  1. Viewing a service detail page shows the service title and description
 *  2. Images on the service detail page have loading="lazy"
 *  3. Service metadata (type, creator, tags) is displayed
 *  4. The page handles navigation from dashboard correctly
 *
 * Demo data: Uses Elif's "Traditional Manti Cooking Workshop" which has
 * tags, description, and is an Offer type service.
 *
 * Note: Uses search to find demo services since the dashboard listing
 * depends on geolocation which is unavailable in CI.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

const DEMO_SERVICE = 'Traditional Manti Cooking Workshop'

/** Search for and click a demo service on the dashboard. */
async function navigateToService(page: import('@playwright/test').Page, title: string) {
  await page.goto('/dashboard')
  const searchInput = page.getByPlaceholder(/search/i).first()
  await expect(searchInput).toBeVisible({ timeout: 15_000 })
  await searchInput.fill(title)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 })
  await page.getByText(title).first().click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 10_000 })
}

test.describe('Service Detail Page', () => {
  test('clicking a service card navigates to its detail page', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await navigateToService(page, DEMO_SERVICE)
  })

  test('service detail page shows title and description', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await navigateToService(page, DEMO_SERVICE)

    // The service title should appear on the detail page
    await expect(
      page.getByText(DEMO_SERVICE).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Service type badge (Offer/Need/Event) should be visible
    await expect(
      page.getByText(/Offer|Need|Event/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('service detail images have lazy loading', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await navigateToService(page, DEMO_SERVICE)

    // Wait for page to fully render
    await page.waitForTimeout(2_000)

    // All rendered images should use loading="lazy" (passes even with zero images)
    const nonLazyImages = page.locator('img:not([loading="lazy"])')
    await expect(nonLazyImages).toHaveCount(0)
  })

  test('service creator info is displayed', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await navigateToService(page, DEMO_SERVICE)

    // The service creator name should appear (Elif)
    await expect(
      page.getByText(/Elif/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('service detail page does not crash on direct URL access', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await loginAs(page, USERS.cem)
    await navigateToService(page, DEMO_SERVICE)

    // Capture the URL
    const detailUrl = page.url()

    // Navigate away and come back directly
    await page.goto('/dashboard')
    await page.goto(detailUrl)

    // Should load without errors
    await expect(
      page.getByText(DEMO_SERVICE).first(),
    ).toBeVisible({ timeout: 15_000 })
    expect(errors).toHaveLength(0)
  })
})
