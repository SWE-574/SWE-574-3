import { test, expect } from '@playwright/test'

import {
  createAcceptedOfferExchange,
  expectToast,
  fetchHandshake,
  findHandshakeId,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-08l: accepted-state cancellation requires an explicit second-party approval', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const title = `FR-08l Offer ${Date.now()}`

  await createAcceptedOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  const handshakeId = await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requester.name,
    status: 'accepted',
  })

  // The first party can only request cancellation; the handshake must stay accepted until the other side agrees.
  await switchUser(page, owner)
  await openConversationForService(page, title)
  page.once('dialog', (dialog) => dialog.accept('Need to reschedule this exchange.'))
  await page.getByRole('button', { name: 'Request Cancellation' }).click()
  await expectToast(page, /Cancellation request sent/i)

  const pendingApprovalHandshake = await fetchHandshake(page, handshakeId)
  expect(pendingApprovalHandshake.status).toBe('accepted')
  expect(pendingApprovalHandshake.cancellation_requested_by_id).toBeTruthy()

  // The requester must explicitly approve before the cancellation can complete.
  await switchUser(page, requester)
  await openConversationForService(page, title)
  await expect(page.getByText(/Cancellation approval needed/i).first()).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Approve Cancellation' }).click()

  await expectToast(page, /reserved hours refunded/i)

  const cancelledHandshake = await fetchHandshake(page, handshakeId)
  expect(cancelledHandshake.status).toBe('cancelled')
})
