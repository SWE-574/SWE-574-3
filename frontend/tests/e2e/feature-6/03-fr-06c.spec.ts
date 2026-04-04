import { test, expect } from '@playwright/test'

import { loginAsUserWithBalanceBelow } from '../helpers'

test('FR-06c: request creation is blocked when the user does not have enough available hours', async ({ page }) => {
  // Pick a seeded user whose current balance is below the form maximum so we can submit an insufficient duration.
  const { balance } = await loginAsUserWithBalanceBelow(page, 10)
  const insufficientDuration = Math.max(1, Math.floor(balance) + 1)

  await page.goto('/post-need')
  await page.locator('input[name="title"]').fill(`FR-06c Need ${Date.now()}`)
  await page.locator('textarea[name="description"]').fill('Feature 6 FR-06c validates insufficient-hour protection for request creation.')
  await page.locator('input[name="duration"]').fill(String(insufficientDuration))
  await page.getByRole('button', { name: 'Online' }).click()
  await page.getByRole('button', { name: 'Post Need' }).click()

  // The form should stay on the request page and surface a clear balance-related error.
  await expect(page).toHaveURL(/\/post-need/, { timeout: 10_000 })
  await expect(page.locator('[data-sonner-toaster] li').filter({
    hasText: /insufficient|balance|need .* more hours/i,
  }).first()).toBeVisible({ timeout: 10_000 })
})
