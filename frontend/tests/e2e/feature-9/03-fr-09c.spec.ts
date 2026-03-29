import { test, expect } from '@playwright/test'

import {
  createPendingOfferWithProposedDetails,
  expectToast,
  fetchHandshake,
  initiateOnlineHandshakeViaApi,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-09c: request changes keeps the handshake pending and lets the provider resubmit', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const title = `FR-09c Offer ${Date.now()}`

  const { handshakeId } = await createPendingOfferWithProposedDetails(page, {
    owner,
    requester,
    title,
    duration: 1,
    meetingLink: 'https://meet.example.com/fr-09c-first',
  })

  // The requester sends the owner back for changes instead of accepting the first proposal.
  await switchUser(page, requester)
  await openConversationForService(page, title)
  await page.getByRole('button', { name: 'Review & Approve' }).click()
  await page.getByRole('button', { name: 'Decline' }).click()
  await expectToast(page, /Session details declined/i)

  const pendingAfterDecline = await fetchHandshake(page, handshakeId)
  expect(pendingAfterDecline.status).toBe('pending')
  expect(pendingAfterDecline.provider_initiated).toBe(false)

  // The owner should be able to propose a second version without recreating the handshake.
  await switchUser(page, owner)
  await openConversationForService(page, title)
  await expect(page.getByRole('button', { name: /Initiate Handshake/i })).toBeVisible({ timeout: 10_000 })

  await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration: 1,
    meetingLink: 'https://meet.example.com/fr-09c-second',
  })
  const pendingAfterResubmit = await fetchHandshake(page, handshakeId)
  expect(pendingAfterResubmit.status).toBe('pending')
  expect(pendingAfterResubmit.provider_initiated).toBe(true)

  await switchUser(page, requester)
  await openConversationForService(page, title)
  await expect(page.getByRole('button', { name: 'Review & Approve' })).toBeVisible({ timeout: 10_000 })
})
