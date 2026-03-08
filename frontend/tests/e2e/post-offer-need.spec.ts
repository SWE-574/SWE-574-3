/**
 * E2E — Post Offer / Post Need
 *
 * Covers: protected routes, form visibility, validation, successful submit → service-detail.
 */

import { test, expect } from '@playwright/test'
import { loginAs, expectToast, USERS } from './helpers/auth'

function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

test.describe('Post Offer', () => {
  test('/post-offer is protected; unauthenticated → /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/post-offer')

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('logged-in user sees Post Offer form', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/post-offer')

    await expect(page.getByLabel(/title/i).or(page.locator('input[name="title"]'))).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('textarea[name="description"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /Post Offer/i })).toBeVisible()
  })

  test('required fields block submit or show error', async ({ page }) => {
    await loginAs(page, USERS.ayse)
    await page.goto('/post-offer')

    await page.getByRole('button', { name: /Post Offer/i }).click()
    await expect(page).toHaveURL(/\/post-offer/)
  })

  test('valid Offer submit → service-detail and toast', async ({ page }) => {
    const title = uniqueTitle('E2E Offer')
    await loginAs(page, USERS.mehmet)
    await page.goto('/post-offer')

    await page.locator('input[name="title"]').fill(title)
    await page.locator('textarea[name="description"]').fill('E2E test offer description.')
    await page.locator('input[name="duration"]').fill('1')
    await page.getByRole('button', { name: 'Online' }).click()
    await page.getByRole('button', { name: /Post Offer/i }).click()

    await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
    await expectToast(page, /created|success|listed/i)
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Post Need', () => {
  test('/post-need is protected; form visible when logged in', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/post-need')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

    await loginAs(page, USERS.zeynep)
    await page.goto('/post-need')
    await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /Post Need/i })).toBeVisible()
  })

  test('valid Need submit → service-detail', async ({ page }) => {
    const title = uniqueTitle('E2E Need')
    await loginAs(page, USERS.deniz)
    await page.goto('/post-need')

    await page.locator('input[name="title"]').fill(title)
    await page.locator('textarea[name="description"]').fill('E2E test need description.')
    await page.locator('input[name="duration"]').fill('1')
    await page.getByRole('button', { name: 'Online' }).click()
    await page.getByRole('button', { name: /Post Need/i }).click()

    await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  })
})
