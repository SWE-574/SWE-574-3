import { test, expect } from '@playwright/test'
import { createOffer, loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-05h: the system requires a confirmation step before cancellation', async ({ page }) => {
  const title = uniqueTitle('FR-05h Confirm Offer')

  // Create a removable offer so the cancellation confirmation dialog can be tested safely.
  await loginAs(page, USERS.cem)
  await createOffer(page, {
    title,
    description: 'Feature 5 FR-05h validates cancellation confirmation.',
  })

  // Dismiss the confirmation dialog and verify the listing is not removed.
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toMatch(/remove this listing/i)
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: 'Remove Listing' }).click()

  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 10_000 })
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
})
