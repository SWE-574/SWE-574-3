import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers'

test('NFR-05c: offer form remains responsive and accessible on desktop and mobile', async ({ page }) => {
  await loginAs(page, USERS.cem)

  // Check the form in a desktop viewport first.
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/post-offer')
  await expect(page.locator('input[name="title"]')).toBeVisible()
  await expect(page.locator('textarea[name="description"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Post Offer' })).toBeVisible()

  // Repeat the same smoke check in a narrow mobile viewport.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/post-offer')
  await expect(page.locator('input[name="title"]')).toBeVisible()
  await expect(page.locator('textarea[name="description"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Post Offer' })).toBeVisible()
})
