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

test('FR-09f: remote accepted exchanges require two separate completion confirmations', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const title = `FR-09f Offer ${Date.now()}`

  await createAcceptedOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  // The provider confirms first, which should leave the handshake waiting for the other side.
  await switchUser(page, owner)
  await openConversationForService(page, title)
  await page.getByRole('button', { name: 'Confirm Completion' }).click()
  await page.getByRole('button', { name: 'Yes, Confirm Completion' }).click()
  await expectToast(page, /Service completion confirmed/i)

  const handshakeId = await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requester.name,
    status: 'accepted',
  })
  const awaitingSecondConfirmation = await fetchHandshake(page, handshakeId)
  expect(awaitingSecondConfirmation.status).toBe('accepted')
  expect(awaitingSecondConfirmation.provider_confirmed_complete).toBe(true)
  expect(awaitingSecondConfirmation.receiver_confirmed_complete).toBe(false)

  // The requester should see the awaiting-second-confirmation cue and complete the second step.
  await switchUser(page, requester)
  await openConversationForService(page, title)
  await expect(page.getByText(/already confirmed.*your turn/i).first()).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Confirm Completion' }).click()
  await page.getByRole('button', { name: 'Yes, Confirm Completion' }).click()
  await expectToast(page, /Service completion confirmed/i)
  await expect(page.getByText(/Service Completed/i).first()).toBeVisible({ timeout: 10_000 })
})
