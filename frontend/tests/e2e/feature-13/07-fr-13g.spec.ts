import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  pickUsersWithBalanceAtLeast,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('FR-13g: owner view shows an Interests panel with interested users and their exchange statuses', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 1, 1, [owner.email])
  const title = uniqueTitle('FR-13g Offer')

  // Build a pending incoming request that the listing owner can inspect from detail.
  const created = await createPendingOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  // The owner should see the incoming participant row and its current status in the sidebar panel.
  await switchUser(page, owner)
  await page.goto(created.detailUrl)
  await expect(page.getByText(/Incoming Requests/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(requester.name).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/^Pending$/).first()).toBeVisible({ timeout: 10_000 })
})
