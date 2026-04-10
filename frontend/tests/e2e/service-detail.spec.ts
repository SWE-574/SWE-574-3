/**
 * E2E — Service Detail Page
 *
 * Covers:
 *  1. Navigating to a service detail page from dashboard search
 *  2. Service detail shows title, description, type badge, creator
 *  3. Images have loading="lazy"
 *  4. Direct URL access works without crash
 *
 * Uses Elif's "Neighborhood Manti Cooking Circle" from setup_demo.py.
 * Search bypasses geolocation filtering (unavailable in CI).
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

const DEMO_SERVICE = 'Neighborhood Manti Cooking Circle'

/** Log in, search for a demo service, click through to its detail page. */
async function loginAndOpenDetail(page: import('@playwright/test').Page) {
  await loginAs(page, USERS.cem)
  // loginAs lands on /dashboard

  const searchInput = page.getByPlaceholder(/search/i).first()
  await expect(searchInput).toBeVisible({ timeout: 15_000 })

  // Search by first word
  await searchInput.fill('Neighborhood')
  await expect(page.getByText(DEMO_SERVICE).first()).toBeVisible({ timeout: 20_000 })
  await page.getByText(DEMO_SERVICE).first().click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 10_000 })
}

test.describe('Service Detail Page', () => {
  test('clicking a service card navigates to its detail page', async ({ page }) => {
    await loginAndOpenDetail(page)
  })

  test('service detail page shows title and description', async ({ page }) => {
    await loginAndOpenDetail(page)

    await expect(page.getByText(DEMO_SERVICE).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Offer|Need|Event/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('service detail images have lazy loading', async ({ page }) => {
    await loginAndOpenDetail(page)
    await page.waitForTimeout(2_000)

    const nonLazyImages = page.locator('img:not([loading="lazy"])')
    await expect(nonLazyImages).toHaveCount(0)
  })

  test('service creator info is displayed', async ({ page }) => {
    await loginAndOpenDetail(page)
    await expect(page.getByText(/Elif/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('service detail page does not crash on direct URL access', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await loginAndOpenDetail(page)
    const detailUrl = page.url()

    // Navigate away and back via direct URL
    await page.goto('/dashboard')
    await page.goto(detailUrl)

    await expect(page.getByText(DEMO_SERVICE).first()).toBeVisible({ timeout: 15_000 })
    expect(errors).toHaveLength(0)
  })
})
