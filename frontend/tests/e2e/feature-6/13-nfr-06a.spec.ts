import { test, expect } from '@playwright/test'

import { loginAsUserWithBalanceAtLeast, uniqueTitle } from '../helpers'

test('NFR-06a: request create, update, and cancel operations complete within 2 seconds under normal load', async ({ page }) => {
  const title = uniqueTitle('NFR-06a Need')
  const updatedTitle = `${title} Updated`

  // Start from a user who can afford the request flow end to end.
  await loginAsUserWithBalanceAtLeast(page, 1)
  await page.goto('/post-need')
  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill('Feature 6 NFR-06a measures request create, update, and cancel timings.')
  await page.locator('input[name="duration"]').fill('1')
  await page.getByRole('button', { name: 'Online' }).click()

  // Measure request creation.
  const createStartedAt = Date.now()
  await page.getByRole('button', { name: 'Post Need' }).click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
  const createElapsedMs = Date.now() - createStartedAt

  // Measure request update.
  const updateStartedAt = Date.now()
  await page.getByRole('button', { name: 'Edit Listing' }).click()
  await page.locator('input[name="title"]').fill(updatedTitle)
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
  await expect(page.getByText(updatedTitle).first()).toBeVisible({ timeout: 10_000 })
  const updateElapsedMs = Date.now() - updateStartedAt

  // Measure request cancellation.
  const cancelStartedAt = Date.now()
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Remove Listing' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
  const cancelElapsedMs = Date.now() - cancelStartedAt

  expect(createElapsedMs).toBeLessThanOrEqual(2_000)
  expect(updateElapsedMs).toBeLessThanOrEqual(2_000)
  expect(cancelElapsedMs).toBeLessThanOrEqual(2_000)
})
