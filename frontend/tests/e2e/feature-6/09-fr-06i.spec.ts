import { test } from '@playwright/test'

import { createNeed, expectNavbarBalance, getCurrentBalance, loginAsUserWithBalanceAtLeast } from '../helpers'

test('FR-06i: cancelling a valid request returns the reserved hours immediately', async ({ page }) => {
  const title = `FR-06i Need ${Date.now()}`
  const duration = 1

  // Create the request and capture the starting balance before the reservation happens.
  const { balance: startingBalance } = await loginAsUserWithBalanceAtLeast(page, duration)
  const { detailUrl } = await createNeed(page, {
    title,
    description: 'Feature 6 FR-06i verifies that reserved hours return immediately after valid request cancellation.',
    duration,
    online: true,
  })

  // First confirm the reservation is visible in the current user balance.
  await page.goto('/notifications')
  await expectNavbarBalance(page, startingBalance - duration)

  // Cancel the request and verify the hours return to the original balance.
  await page.goto(detailUrl)
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Remove Listing' }).click()

  await page.goto('/notifications')
  await expectNavbarBalance(page, startingBalance)

  const currentBalance = await getCurrentBalance(page)
  if (currentBalance !== startingBalance) {
    throw new Error(`Expected refunded balance ${startingBalance}, received ${currentBalance}.`)
  }
})
