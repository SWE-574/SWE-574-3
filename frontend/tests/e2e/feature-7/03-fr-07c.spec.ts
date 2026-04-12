import { test, expect } from '@playwright/test'

import {
  createRequestForTimeShare,
  getCurrentBalance,
  listTransactions,
  loginAsUserWithBalanceAtLeast,
  openTimeActivity,
} from '../helpers'

test('FR-07c: request creation reserves hours when a Time Share rule requires it', async ({ page }) => {
  // Start from a user who can afford the request and capture the spendable balance before reservation.
  const { balance: startingBalance } = await loginAsUserWithBalanceAtLeast(page, 1)
  const { title } = await createRequestForTimeShare(page, {
    title: `FR-07c Need ${Date.now()}`,
    duration: 1,
  })

  // The reserved hour should immediately reduce available balance.
  const currentBalance = await getCurrentBalance(page)
  expect(currentBalance).toBe(startingBalance - 1)

  // The same reservation should appear in the visible transaction history for the created request.
  await openTimeActivity(page)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })

  const transactions = await listTransactions(page)
  const related = transactions.results.find((transaction) => transaction.service_title === title)
  expect(related).toBeTruthy()
})
