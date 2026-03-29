import { test, expect } from '@playwright/test'

import {
  approvePendingHandshakeViaApi,
  createPendingOfferWithProposedDetails,
  openChatFromServiceDetail,
  pickUsersWithBalanceAtLeast,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('FR-13l: the meeting link is disclosed only to parties whose exchange reaches accepted state', async ({ page }) => {
  const owner = USERS.elif
  const picked = await pickUsersWithBalanceAtLeast(page, 1, 2, [owner.email])
  const requester = picked[0]?.user
  const outsider = picked[1]?.user

  if (!requester || !outsider) {
    throw new Error('Could not pick accepted and outsider users for FR-13l.')
  }

  const title = uniqueTitle('FR-13l Offer')
  const meetingLink = 'https://meet.example.com/fr-13l'

  // Build an offer flow where the owner has already proposed exact remote details.
  const created = await createPendingOfferWithProposedDetails(page, {
    owner,
    requester,
    title,
    duration: 1,
    meetingLink,
  })

  // Accept the pending handshake, then verify the accepted participant can reach the disclosed meeting link.
  await switchUser(page, requester)
  await approvePendingHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
  })

  await page.goto(created.detailUrl)
  await expect(page.getByRole('button', { name: 'Open Chat' })).toBeVisible({ timeout: 10_000 })
  await openChatFromServiceDetail(page)
  await expect(page.getByText(meetingLink).first()).toBeVisible({ timeout: 10_000 })

  // A different non-party user should not see the exact meeting link from the listing flow.
  await switchUser(page, outsider)
  await page.goto(created.detailUrl)
  await expect(page.getByText(meetingLink)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Open Chat|View Chat \(Pending\)/i })).toHaveCount(0)
  await expect(page.getByText(/Service Full|All Slots Taken/i).first()).toBeVisible({ timeout: 10_000 })
})
