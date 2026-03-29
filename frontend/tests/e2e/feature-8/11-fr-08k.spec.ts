import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  expectToast,
  fetchHandshake,
  findHandshakeId,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-08k: either exchange party can cancel unilaterally while the handshake is still pending', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])

  // First, prove that the requester can cancel a pending exchange directly from the chat.
  const requesterCancelTitle = `FR-08k Requester Cancel ${Date.now()}`
  await createPendingOfferExchange(page, {
    owner,
    requester,
    title: requesterCancelTitle,
    duration: 1,
  })

  await openConversationForService(page, requesterCancelTitle)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expectToast(page, /Handshake cancelled/i)

  const requesterCancelledId = await findHandshakeId(page, {
    serviceTitle: requesterCancelTitle,
    requesterName: requester.name,
  })
  const requesterCancelledHandshake = await fetchHandshake(page, requesterCancelledId)
  expect(requesterCancelledHandshake.status).toBe('cancelled')

  // Then prove that the service owner can do the same on another still-pending exchange.
  const ownerCancelTitle = `FR-08k Owner Cancel ${Date.now()}`
  await createPendingOfferExchange(page, {
    owner,
    requester,
    title: ownerCancelTitle,
    duration: 1,
  })

  await switchUser(page, owner)
  await openConversationForService(page, ownerCancelTitle)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expectToast(page, /Handshake cancelled/i)

  const ownerCancelledId = await findHandshakeId(page, {
    serviceTitle: ownerCancelTitle,
    requesterName: requester.name,
  })
  const ownerCancelledHandshake = await fetchHandshake(page, ownerCancelledId)
  expect(ownerCancelledHandshake.status).toBe('cancelled')
})
