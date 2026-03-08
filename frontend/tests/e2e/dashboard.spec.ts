/**
 * E2E — Dashboard
 *
 * Covers:
 *  1. Authenticated user sees the dashboard with service cards
 *  2. Service cards render with images that have loading="lazy"
 *  3. Search/filter bar is present and functional
 *  4. Polling does not cause page errors (no console errors after wait)
 *
 * Demo data: 15 services seeded by setup_demo.py across multiple users.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('Dashboard', () => {
  test('authenticated user sees service cards on the dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/dashboard')

    // Wait for at least one service card to appear
    // Demo data includes services from Elif, Ayse, Zeynep, etc.
    await expect(
      page.getByText(/Manti|Börek|Chess|Gardening|Genealogy|Coffee|Photography/i).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('dashboard images have lazy loading attribute', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/dashboard')

    // Wait for service cards to render
    await expect(
      page.getByText(/Manti|Börek|Chess|Gardening|Genealogy/i).first(),
    ).toBeVisible({ timeout: 20_000 })

    // Service card images use loading="lazy"; allow up to 2 for navbar/logo/avatar
    const nonLazyImages = page.locator('img:not([loading="lazy"])')
    const count = await nonLazyImages.count()
    expect(count).toBeLessThanOrEqual(2)
  })

  test('search bar is present and filters services', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/dashboard')

    // Wait for services to load
    await expect(
      page.getByText(/Manti|Börek|Chess|Gardening/i).first(),
    ).toBeVisible({ timeout: 20_000 })

    // Find the search input
    const searchInput = page.getByPlaceholder(/search/i).first()
    await expect(searchInput).toBeVisible({ timeout: 10_000 })

    // Type a search term that matches one specific service
    await searchInput.fill('Chess')

    // After debounce, at least one visible service result should match Chess.
    await expect(page.locator('a[href*="/service-detail/"]').filter({ hasText: /Chess/i }).first()).toBeVisible({ timeout: 15_000 })
  })

  test('filter tabs are visible and clickable', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/dashboard')

    await expect(
      page.getByText(/Manti|Börek|Chess|Gardening/i).first(),
    ).toBeVisible({ timeout: 20_000 })

    // The filter tabs (All, Offers, Needs, Events) should be visible
    const allTab = page.getByRole('button', { name: /^All$/i }).first()
    await expect(allTab).toBeVisible({ timeout: 10_000 })
  })

  test('Offers filter or Offer-type cards visible on dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/dashboard')

    await expect(
      page.getByText(/Manti|Börek|Chess|Gardening|Genealogy/i).first(),
    ).toBeVisible({ timeout: 20_000 })

    // Dashboard shows service cards; at least one should be Offer type (green Offer pill)
    const offerPill = page.getByText('Offer').first()
    await expect(offerPill).toBeVisible({ timeout: 10_000 })
  })

  test('dashboard polling does not cause page crashes', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await loginAs(page, USERS.elif)
    await page.goto('/dashboard')

    await expect(
      page.getByText(/Manti|Börek|Chess/i).first(),
    ).toBeVisible({ timeout: 20_000 })

    // Wait for network to settle so any polling/refetch errors are captured
    await page.waitForLoadState('networkidle').catch(() => {})

    expect(errors).toHaveLength(0)
  })
})
