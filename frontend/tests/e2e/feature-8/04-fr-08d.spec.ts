import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  expectToast,
  initiateOnlineHandshakeViaApi,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-08d: requester can review proposed details, request changes, and see approve-or-decline controls', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const { title } = await createPendingOfferExchange(page, {
    owner,
    requester,
    title: `FR-08d Offer ${Date.now()}`,
    duration: 1,
  })

  // The owner proposes the first session so the requester can review it.
  await switchUser(page, owner)
  await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration: 1,
    meetingLink: 'https://meet.example.com/fr-08d-first-pass',
  })

  // The requester should see both review outcomes before sending the owner back for changes.
  await switchUser(page, requester)
  await openConversationForService(page, title)
  await page.getByRole('button', { name: 'Review & Approve' }).click()
  await expect(page.getByRole('button', { name: 'Approve & Confirm' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Decline' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Decline' }).click()

  await expectToast(page, /declined/i)
  await expect(page.getByText(/Waiting for the service owner/i).first()).toBeVisible({ timeout: 10_000 })

  // After the owner re-sends details, the requester should still have approve-or-cancel choices in the pending state.
  await switchUser(page, owner)
  await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration: 1,
    meetingLink: 'https://meet.example.com/fr-08d-second-pass',
  })

  await switchUser(page, requester)
  await openConversationForService(page, title)
  await expect(page.getByRole('button', { name: 'Review & Approve' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 10_000 })
})
