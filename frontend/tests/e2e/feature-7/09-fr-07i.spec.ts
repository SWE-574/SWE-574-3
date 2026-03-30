import { test, expect } from '@playwright/test'

import {
  getCurrentBalance,
  listTransactions,
  loginAsUserWithBalanceBelow,
} from '../helpers'

test('FR-07i: failed Time Share operations do not partially commit balance or ledger changes', async ({ page }) => {
  // Pick a user who cannot afford the requested duration so the create flow must fail.
  const { balance: startingBalance } = await loginAsUserWithBalanceBelow(page, 10)
  const beforeTransactions = await listTransactions(page)
  const insufficientDuration = Math.max(1, Math.floor(startingBalance) + 1)

  await page.goto('/post-need')
  await page.locator('input[name="title"]').fill(`FR-07i Need ${Date.now()}`)
  await page.locator('textarea[name="description"]').fill('Feature 7 FR-07i checks atomic failure behavior for insufficient Time Share balance.')
  await page.locator('input[name="duration"]').fill(String(insufficientDuration))
  await page.getByRole('button', { name: 'Online' }).click()
  await page.getByRole('button', { name: 'Post Need' }).click()

  // The create action should fail visibly without altering the actual balance or ledger count.
  await expect(page).toHaveURL(/\/post-need/, { timeout: 10_000 })

  const currentBalance = await getCurrentBalance(page)
  const afterTransactions = await listTransactions(page)
  expect(currentBalance).toBe(startingBalance)
  expect(afterTransactions.count).toBe(beforeTransactions.count)
})
