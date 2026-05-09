import { test, expect } from '@playwright/test'

import {
  getCurrentBalance,
  listTransactions,
  loginAsUserWithBalanceBelow,
} from '../helpers'

test.skip('FR-07i: failed Time Share operations do not partially commit balance or ledger changes', async ({ page }) => {
  // Category C: loginAsUserWithBalanceBelow(page, 10) iterates seeded demo
  // users until one has < 10 hours. After the demo seed was rebalanced the
  // condition is never satisfied, so the helper throws "Could not find a
  // demo user with balance below 10" before the spec body runs (every
  // attempt fails in ~10s). Either re-seed a guaranteed low-balance user
  // or rewrite the spec to call /api/e2e/set-balance/ before posting.

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
