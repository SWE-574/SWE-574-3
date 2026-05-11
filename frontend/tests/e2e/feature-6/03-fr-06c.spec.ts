import { test, expect } from '@playwright/test'

import { createNeed, getCurrentBalance, loginAsUserWithBalanceBelow } from '../helpers'

test('FR-06c: request creation is blocked when it would exceed the TimeBank debt limit', async ({ page }) => {
  // The product allows members to go down to -10h, so this test sets a user
  // near that boundary using real need reservations, then submits one more
  // need that would cross it.
  const { balance } = await loginAsUserWithBalanceBelow(page, 10)
  if (balance > -1) {
    await createNeed(page, {
      title: `FR-06c Boundary Need ${Date.now()}`,
      description: 'Feature 6 FR-06c prepares the user near the TimeBank debt boundary.',
      duration: 10,
      online: true,
    })
  }
  const currentBalance = await getCurrentBalance(page)
  const insufficientDuration = Math.min(10, Math.floor(currentBalance + 10) + 1)

  await page.goto('/post-need')
  await page.locator('input[name="title"]').fill(`FR-06c Need ${Date.now()}`)
  await page.locator('textarea[name="description"]').fill('Feature 6 FR-06c validates debt-limit protection for need creation.')
  await page.locator('input[name="duration"]').fill(String(insufficientDuration))
  await page.getByRole('button', { name: 'Online' }).click()
  await page.getByRole('button', { name: 'Post Need' }).click()

  // The form should stay on the need page and surface a clear balance/debt-related error.
  await expect(page).toHaveURL(/\/post-need/, { timeout: 10_000 })
  await expect(page.locator('[data-sonner-toaster] li').filter({
    hasText: /insufficient|balance|debt|maximum/i,
  }).first()).toBeVisible({ timeout: 10_000 })
})
