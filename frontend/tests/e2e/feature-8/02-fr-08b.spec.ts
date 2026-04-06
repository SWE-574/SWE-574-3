import { test, expect } from '@playwright/test'

import {
  createNeed,
  fetchHandshake,
  findHandshakeId,
  loginAs,
  listTransactions,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  requestOfferFromDetail,
  switchUser,
} from '../helpers'

test('FR-08b: responding to a request creates a pending exchange without extra reservation', async ({ page }) => {
  const [
    { user: owner },
    { user: responder },
  ] = await pickUsersWithBalanceAtLeast(page, 2, 2)
  const title = `FR-08b Need ${Date.now()}`

  // The request owner reserves time at creation time.
  await loginAs(page, owner)
  const { detailUrl } = await createNeed(page, {
    title,
    description: 'Feature 8 FR-08b verifies that request responses do not reserve hours again.',
    duration: 1,
    online: true,
  })
  const transactionsAfterCreation = await listTransactions(page)
  const relatedTransactionsAfterCreation = transactionsAfterCreation.results.filter((transaction) => (
    transaction.service_title === title
  ))

  // A helper responds to the request, which should only create the pending exchange.
  await switchUser(page, responder)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  // The pending handshake should carry the agreed reserved-hour amount.
  const handshakeId = await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: responder.name,
    status: 'pending',
  })
  const handshake = await fetchHandshake(page, handshakeId)
  expect(handshake.provisioned_hours).toBe(1)

  // Responding to the request should not create any additional reservation-side ledger movement.
  await switchUser(page, owner)
  const transactionsAfterResponse = await listTransactions(page)
  const relatedTransactionsAfterResponse = transactionsAfterResponse.results.filter((transaction) => (
    transaction.service_title === title
  ))
  expect(relatedTransactionsAfterResponse.length).toBe(relatedTransactionsAfterCreation.length)

  // The owner should now see the pending exchange in Messages and be able to propose details.
  await openConversationForService(page, title)
  await expect(page.getByText(/Propose a session|Share fixed group details/i).first()).toBeVisible({ timeout: 10_000 })
})
