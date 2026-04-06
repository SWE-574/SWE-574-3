import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  expectToast,
  fetchHandshake,
  findHandshakeId,
  getCurrentBalance,
  initiateOnlineHandshakeViaApi,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-08f: declining a pending exchange cancels it and refunds reserved hours immediately', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester, balance: startingBalance }] = await pickUsersWithBalanceAtLeast(
    page,
    2,
    1,
    [owner.email],
  )
  const title = `FR-08f Offer ${Date.now()}`

  await createPendingOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  // In the current runtime, pending offer reservations are carried on the handshake payload directly.
  const pendingHandshakeId = await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requester.name,
    status: 'pending',
  })
  const pendingHandshake = await fetchHandshake(page, pendingHandshakeId)
  expect(pendingHandshake.provisioned_hours).toBe(1)
  expect(pendingHandshake.status).toBe('pending')

  // Once the owner proposes details, the requester declines the exchange from the pending thread.
  await switchUser(page, owner)
  await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration: 1,
    meetingLink: 'https://meet.example.com/fr-08f',
  })

  await switchUser(page, requester)
  await openConversationForService(page, title)
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expectToast(page, /Handshake cancelled/i)

  // The exchange should be cancelled and the reserved hour should return immediately.
  const handshakeId = await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requester.name,
  })
  const handshake = await fetchHandshake(page, handshakeId)
  expect(handshake.status).toBe('cancelled')

  const refundedBalance = await getCurrentBalance(page)
  expect(refundedBalance).toBe(startingBalance)
})
