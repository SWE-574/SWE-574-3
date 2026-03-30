import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  fetchHandshake,
  findHandshakeId,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  USERS,
} from '../helpers'

test('FR-08a: offer interest creates a pending exchange and reserves hours immediately', async ({ page }) => {
  const owner = USERS.elif

  // Pick a requester who can afford the offer so the reservation is observable.
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(
    page,
    2,
    1,
    [owner.email],
  )

  const { title } = await createPendingOfferExchange(page, {
    owner,
    requester,
    title: `FR-08a Offer ${Date.now()}`,
    duration: 1,
  })

  // The pending exchange should carry the reserved hour amount directly on the handshake payload.
  const handshakeId = await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requester.name,
    status: 'pending',
  })
  const handshake = await fetchHandshake(page, handshakeId)
  expect(handshake.provisioned_hours).toBe(1)
  expect(handshake.status).toBe('pending')

  // The pending exchange should open a private chat that waits for the service owner.
  await openConversationForService(page, title)
  await expect(page.getByText(/Waiting for the service owner/i).first()).toBeVisible({ timeout: 10_000 })
})
