/**
 * E2E — Profile and Public Profile
 *
 * Covers: /profile protected, own profile content, tabs, public profile, Message button.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'
import { DEMO_SERVICE_PATTERN } from './helpers/demo-data'

const ELIF_SERVICE_TITLE = 'Neighborhood Manti Cooking Circle'

test.describe('Profile', () => {
  test('/profile is protected; unauthenticated → /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/profile')

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('logged-in user sees own profile (profile actions or tabs)', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 })
    const editProfileBtn = page.getByRole('button', { name: /Edit Profile/i })
    const offersTab = page.getByText(/Offers|Needs|Exchanges|Badges/i).first()
    await expect(editProfileBtn.or(offersTab)).toBeVisible({ timeout: 10_000 })
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

    const serviceCard = page.getByText(ELIF_SERVICE_TITLE).first()
    await expect(serviceCard).toBeVisible({ timeout: 20_000 })
    await serviceCard.click()
    await expect(page).toHaveURL(/\/service-detail\//)

    const creatorLink = page.locator('a[href*="/public-profile/"]').first()
    await expect(creatorLink).toBeVisible({ timeout: 10_000 })
    await creatorLink.click()

    await expect(page).toHaveURL(/\/public-profile\//, { timeout: 10_000 })
    await expect(page.getByText(/Elif|Member since|karma/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('public profile shows profile stats and sections', async ({ page }) => {
    await loginAs(page, USERS.can)
    await page.goto('/dashboard')
    const serviceCard = page.getByText(ELIF_SERVICE_TITLE).first()
    await expect(serviceCard).toBeVisible({ timeout: 20_000 })
    await serviceCard.click()
    const creatorLink = page.locator('a[href*="/public-profile/"]').first()
    await expect(creatorLink).toBeVisible({ timeout: 10_000 })
    await creatorLink.click()

    await expect(page).toHaveURL(/\/public-profile\//)
    await expect(page.getByText(/Offers|Needs|Exchanges|Badges|Reviews/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
