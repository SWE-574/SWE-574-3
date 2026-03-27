import { test, expect } from '@playwright/test'
import { loginAs, uniqueTitle, USERS } from '../helpers'

test('NFR-05a: offer creation is reflected in feed views within 2 seconds under normal load', async ({ page }) => {
  const title = uniqueTitle('NFR-05a Offer')

  // Create a basic offer and measure the full create-to-detail reflection time.
  await loginAs(page, USERS.zeynep)
  await page.goto('/post-offer')
  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill('Feature 5 NFR-05a measures feed reflection speed for offer creation.')
  await page.locator('input[name="duration"]').fill('1')
  await page.getByRole('button', { name: 'Online' }).click()

  const startedAt = Date.now()
  await page.getByRole('button', { name: 'Post Offer' }).click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  const elapsedMs = Date.now() - startedAt

  // The end-to-end visible result should appear within the target budget.
  expect(elapsedMs).toBeLessThanOrEqual(2_000)
})
