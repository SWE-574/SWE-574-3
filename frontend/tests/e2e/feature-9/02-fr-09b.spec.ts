import { test, expect } from '@playwright/test'

import {
  createPendingOfferWithProposedDetails,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  postHandshakeAction,
  switchUser,
  USERS,
} from '../helpers'

test('FR-09b: only the requester can approve or decline provider-submitted session details', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const title = `FR-09b Offer ${Date.now()}`

  const { handshakeId } = await createPendingOfferWithProposedDetails(page, {
    owner,
    requester,
    title,
    duration: 1,
    meetingLink: 'https://meet.example.com/fr-09b',
  })

  // The owner can only wait after sending details; requester-only review controls must stay hidden.
  await openConversationForService(page, title)
  await expect(page.getByText(/Session details sent/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Review & Approve' })).toHaveCount(0)

  const ownerApproveResult = await postHandshakeAction(page, handshakeId, 'approve')
  expect(ownerApproveResult.ok).toBeFalsy()
  expect(ownerApproveResult.status).toBe(403)

  // The requester should be the only side that can open the review modal and decide the outcome.
  await switchUser(page, requester)
  await openConversationForService(page, title)
  await expect(page.getByRole('button', { name: 'Review & Approve' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Review & Approve' }).click()
  await expect(page.getByRole('button', { name: 'Approve & Confirm' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Decline' })).toBeVisible({ timeout: 10_000 })
})
