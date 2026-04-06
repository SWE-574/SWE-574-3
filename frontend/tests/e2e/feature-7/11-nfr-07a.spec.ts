import { test, expect } from '@playwright/test'

import { loginAsUserWithBalanceAtLeast } from '../helpers'

test('NFR-07a: hour reservation and refund operations complete within 1 second under normal load', async ({ page }) => {
  const title = `NFR-07a Need ${Date.now()}`

  // Use the request flow because it triggers both reservation and refund behavior in a compact scenario.
  await loginAsUserWithBalanceAtLeast(page, 1)
  await page.goto('/post-need')
  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill('Feature 7 NFR-07a measures reservation and refund timing.')
  await page.locator('input[name="duration"]').fill('1')
  await page.getByRole('button', { name: 'Online' }).click()

  // Measure the reservation step.
  const reserveStartedAt = Date.now()
  await page.getByRole('button', { name: 'Post Need' }).click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
  const reserveElapsedMs = Date.now() - reserveStartedAt

  // Measure the refund step through valid cancellation.
  const refundStartedAt = Date.now()
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Remove Listing' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
  const refundElapsedMs = Date.now() - refundStartedAt

  expect(reserveElapsedMs).toBeLessThanOrEqual(1_000)
  expect(refundElapsedMs).toBeLessThanOrEqual(1_000)
})
