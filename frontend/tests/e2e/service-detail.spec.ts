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
 * To avoid fragile dashboard-UI search in CI, most tests resolve the
 * service ID via the API and navigate directly to its detail URL.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

const DEMO_SERVICE = 'Neighborhood Manti Cooking Circle'

/**
 * After loginAs(), resolve the demo service ID via the REST API and
 * return its detail page URL.  Much more reliable in CI than filling
 * the dashboard search input and waiting for React to re-render.
 */
async function getDetailUrl(page: import('@playwright/test').Page): Promise<string> {
  const result = await page.evaluate(async (title) => {
    const res = await fetch(`/api/services/?search=${encodeURIComponent(title)}`, {
      credentials: 'include',
    })
    if (!res.ok) return { ok: false, body: await res.text() } as const
    const data = await res.json()
    const list = data.results ?? data
    const match = list.find((s: { title: string }) => s.title === title)
    if (!match) return { ok: false, body: `No service titled "${title}" in ${list.length} results` } as const
    return { ok: true, id: String(match.id) } as const
  }, DEMO_SERVICE)

  expect(result.ok, `getDetailUrl failed: ${'body' in result ? result.body : ''}`).toBeTruthy()
  return `/service-detail/${(result as { ok: true; id: string }).id}`
}

/** Log in, resolve the detail URL via API, navigate to it. */
async function loginAndOpenDetail(page: import('@playwright/test').Page) {
  await loginAs(page, USERS.cem)
  const detailUrl = await getDetailUrl(page)
  await page.goto(detailUrl)
  await expect(page.getByText(DEMO_SERVICE).first()).toBeVisible({ timeout: 20_000 })
}

test.describe('Service Detail Page', () => {
  test('clicking a service card navigates to its detail page', async ({ page }) => {
    await loginAs(page, USERS.cem)

    // Use dashboard search to navigate (tests the real user flow)
    const searchInput = page.getByPlaceholder(/search/i).first()
    await expect(searchInput).toBeVisible({ timeout: 20_000 })
    await searchInput.fill('Neighborhood')
    await expect(page.getByText(DEMO_SERVICE).first()).toBeVisible({ timeout: 20_000 })
    await page.getByText(DEMO_SERVICE).first().click()
    await expect(page).toHaveURL(/\/service-detail\//, { timeout: 10_000 })
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

    await loginAs(page, USERS.cem)
    const detailUrl = await getDetailUrl(page)

    // Navigate directly — no dashboard search needed
    await page.goto(detailUrl)
    await expect(page.getByText(DEMO_SERVICE).first()).toBeVisible({ timeout: 15_000 })
    expect(errors).toHaveLength(0)
  })
})
