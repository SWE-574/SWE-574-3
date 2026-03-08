/**
 * E2E — Profile and Public Profile
 *
 * Covers: /profile protected, own profile content, tabs, public profile, Message button.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'
import { DEMO_SERVICE_PATTERN } from './helpers/demo-data'

test.describe('Profile', () => {
  test('/profile is protected; unauthenticated → /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/profile')

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('logged-in user sees own profile (name or balance)', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 })
    const nameVisible = await page.getByText(USERS.elif.name).first().isVisible().catch(() => false)
    const balanceVisible = await page.getByText(/Time Available|Your Time/i).first().isVisible().catch(() => false)
    expect(nameVisible || balanceVisible).toBeTruthy()
  })

  test('profile tabs or sections are visible', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/profile')

    const offersOrHistory = page.getByText(/Offers|Needs|History|Settings/i).first()
    await expect(offersOrHistory).toBeVisible({ timeout: 10_000 })
  })

  test('/public-profile/:id shows other user profile', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/dashboard')

    const serviceCard = page.getByText(DEMO_SERVICE_PATTERN).first()
    await expect(serviceCard).toBeVisible({ timeout: 20_000 })
    await serviceCard.click()
    await expect(page).toHaveURL(/\/service-detail\//)

    const creatorLink = page.locator('a[href*="/public-profile/"]').first()
    await expect(creatorLink).toBeVisible({ timeout: 10_000 })
    await creatorLink.click()

    await expect(page).toHaveURL(/\/public-profile\//, { timeout: 10_000 })
    await expect(page.locator('h1, h2, [font-weight="800"]').first()).toBeVisible({ timeout: 10_000 })
  })

  test('public profile shows Message button when logged in', async ({ page }) => {
    await loginAs(page, USERS.can)
    await page.goto('/dashboard')
    const serviceCard = page.getByText(DEMO_SERVICE_PATTERN).first()
    await expect(serviceCard).toBeVisible({ timeout: 20_000 })
    await serviceCard.click()
    const creatorLink = page.locator('a[href*="/public-profile/"]').first()
    await expect(creatorLink).toBeVisible({ timeout: 10_000 })
    await creatorLink.click()

    await expect(page).toHaveURL(/\/public-profile\//)
    await expect(
      page.getByRole('button', { name: /Message/i }).or(page.getByText('Message')).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})
