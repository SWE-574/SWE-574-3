import { test, expect } from '@playwright/test'

import {
  createAcceptedOfferExchange,
  getCurrentBalance,
  openTimeActivity,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-07b: time activity keeps available hours separate from reserved accepted-exchange hours', async ({ page }) => {
  const owner = USERS.cem

  // Pick a requester who can afford the reservation and capture their starting balance.
  const [{ user: requester, balance: startingBalance }] = await pickUsersWithBalanceAtLeast(
    page,
    1,
    1,
    [owner.email],
  )

  // Create and accept an offer so the requester lands in an active reserved-hours state.
  const { title } = await createAcceptedOfferExchange(page, {
    owner,
    requester,
    title: `FR-07b Offer ${Date.now()}`,
    duration: 1,
  })

  // The requester should see both the reduced available balance and the reserved-hours explanation.
  await switchUser(page, requester)
  const currentBalance = await getCurrentBalance(page)
  expect(currentBalance).toBe(startingBalance - 1)

  await openTimeActivity(page)
  await expect(page.getByText('Active Agreements')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Reserved now/i).first()).toBeVisible()
  await expect(page.getByText(/Already reserved at acceptance/i).first()).toBeVisible()
})
