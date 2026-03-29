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

test('FR-08h: remote accepted exchanges require independent completion confirmations from both parties', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const title = `FR-08h Offer ${Date.now()}`

  await createAcceptedOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  // The provider confirms first, but the handshake must stay accepted until the requester also confirms.
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
  const afterFirstConfirmation = await fetchHandshake(page, handshakeId)
  expect(afterFirstConfirmation.status).toBe('accepted')
  expect(afterFirstConfirmation.provider_confirmed_complete).toBe(true)
  expect(afterFirstConfirmation.receiver_confirmed_complete).toBe(false)

  // The requester sees that one confirmation is already on file and completes the second half.
  await switchUser(page, requester)
  await openConversationForService(page, title)
  await expect(page.getByText(/already confirmed.*your turn/i).first()).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Confirm Completion' }).click()
  await page.getByRole('button', { name: 'Yes, Confirm Completion' }).click()
  await expectToast(page, /Service completion confirmed/i)
  await expect(page.getByText(/Service Completed/i).first()).toBeVisible({ timeout: 10_000 })
})
