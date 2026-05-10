import { test, expect } from '@playwright/test'

import { loginAsUserWithBalanceAtLeast, uniqueTitle } from '../helpers'
import { expectToast } from '../helpers/auth'

test('NFR-06a: invalid submit surfaces feedback; create / update / cancel each complete under 2s', async ({ page }) => {
  const title = uniqueTitle('NFR-06a Need')
  const updatedTitle = `${title} Updated`

  // Start from a user who can afford the request flow end to end.
  await loginAsUserWithBalanceAtLeast(page, 1)
  await page.goto('/post-need')

  // ── Invalid-submit path ──────────────────────────────────────────────────
  // Posting with empty inputs must trigger the new onInvalid handler — a
  // toast surfaces, the inline zod error renders under the offending field,
  // and the route stays on /post-need. This guards the prior silent-no-op
  // regression where validation rejections were dropped on the floor.
  await page.getByRole('button', { name: 'Post Need' }).click()
  await expectToast(page, /Please check the highlighted fields/i)
  await expect(page).toHaveURL(/\/post-need/)
  await expect(page.getByText('Title must be at least 3 characters')).toBeVisible()

  // Now fill the form with valid inputs for the timing measurements below.
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
  await page.getByRole('button', { name: 'Remove Listing' }).click()
  await page.getByRole('button', { name: /^Remove$/ }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
  const cancelElapsedMs = Date.now() - cancelStartedAt

  expect(createElapsedMs).toBeLessThanOrEqual(2_000)
  expect(updateElapsedMs).toBeLessThanOrEqual(2_000)
  expect(cancelElapsedMs).toBeLessThanOrEqual(2_000)
})
