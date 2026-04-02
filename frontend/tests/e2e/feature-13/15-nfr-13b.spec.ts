import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  pickUsersWithBalanceAtLeast,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('NFR-13b: owner-only Interests panel data is not visible to other regular users', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 1, 1, [owner.email])
  const title = uniqueTitle('NFR-13b Offer')

  // Create one incoming interest so the owner view definitely has sensitive panel data to protect.
  const created = await createPendingOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  await switchUser(page, owner)
  await page.goto(created.detailUrl)
  await expect(page.getByText(/Incoming Requests/i).first()).toBeVisible({ timeout: 10_000 })

  // The interested non-owner should see only their own action/chat state, not the owner-only interest list panel.
  await switchUser(page, requester)
  await page.goto(created.detailUrl)
  await expect(page.getByText(/Incoming Requests/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /View Chat \(Pending\)|Open Chat/i }).first()).toBeVisible({ timeout: 10_000 })
})
