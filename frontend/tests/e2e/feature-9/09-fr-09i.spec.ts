import { test, expect } from '@playwright/test'

import {
  completeOfferExchange,
  createAcceptedGroupOfferExchanges,
  fetchHandshake,
  findHandshakeId,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-09i: group-offer handshakes stay independent while the owner still sees consolidated participant progress', async ({ page }) => {
  const owner = USERS.elif
  const picked = await pickUsersWithBalanceAtLeast(page, 2, 2, [owner.email])
  const requesters = picked.map((entry) => entry.user)
  const title = `FR-09i Group Offer ${Date.now()}`

  const { detailUrl } = await createAcceptedGroupOfferExchanges(page, {
    owner,
    requesters,
    title,
    duration: 1,
  })

  // Complete only the first participant handshake so the second one stays independently active.
  await completeOfferExchange(page, {
    owner,
    requester: requesters[0],
    serviceTitle: title,
  })

  await switchUser(page, owner)
  const firstHandshake = await fetchHandshake(page, await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requesters[0].name,
  }))
  const secondHandshake = await fetchHandshake(page, await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requesters[1].name,
  }))

  expect(firstHandshake.status).toBe('completed')
  expect(secondHandshake.status).toBe('accepted')

  // The owner-facing detail page should still show a single consolidated participant surface.
  await page.goto(detailUrl)
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 10_000 })
  await expect(page.getByText(requesters[0].name).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(requesters[1].name).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/2\/2 slots/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Completed/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Accepted/i).first()).toBeVisible({ timeout: 10_000 })
})
