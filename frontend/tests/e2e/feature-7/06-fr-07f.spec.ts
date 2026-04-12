import { test, expect } from '@playwright/test'

import {
  createRequestForTimeShare,
  getCurrentBalance,
  loginAsUserWithBalanceAtLeast,
  openTimeActivity,
} from '../helpers'

test('FR-07f: cancelling before completion returns reserved hours to the requester balance', async ({ page }) => {
  // Create a request that reserves one hour so the cancellation flow has something to refund.
  const { balance: startingBalance } = await loginAsUserWithBalanceAtLeast(page, 1)
  const { detailUrl } = await createRequestForTimeShare(page, {
    title: `FR-07f Need ${Date.now()}`,
    duration: 1,
  })

  // Cancel the request before any exchange reaches completion.
  await page.goto(detailUrl)
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Remove Listing' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })

  // The reserved hour should be returned immediately and recorded as a refund entry.
  const currentBalance = await getCurrentBalance(page)
  expect(currentBalance).toBe(startingBalance)

  await openTimeActivity(page)
  await expect(page.getByRole('button', { name: 'Shared' })).toBeVisible()
})
