import { test, expect } from '@playwright/test'

import {
  acceptPendingHandshakeViaApi,
  createServiceViaApi,
  loginAs,
  pickUsersWithBalanceAtLeast,
  requestOfferFromDetail,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('FR-13i: pending requests do not consume capacity, but accepted capacity blocks the offer action', async ({ page }) => {
  const owner = USERS.elif
  const picked = await pickUsersWithBalanceAtLeast(page, 1, 2, [owner.email])
  const requesterOne = picked[0]?.user
  const requesterTwo = picked[1]?.user

  if (!requesterOne || !requesterTwo) {
    throw new Error('Could not pick two requesters for FR-13i.')
  }

  const title = uniqueTitle('FR-13i Offer')

  // Create a one-to-one offer and let the first requester open only a pending handshake.
  await loginAs(page, owner)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 FR-13i checks pending-vs-accepted capacity handling.',
    duration: 1,
    locationType: 'Online',
    maxParticipants: 1,
  })

  await switchUser(page, requesterOne)
  await page.goto(created.detailUrl)
  await requestOfferFromDetail(page)

  // A second requester should still see the action while the first handshake is only pending.
  await switchUser(page, requesterTwo)
  await page.goto(created.detailUrl)
  await expect(page.getByRole('button', { name: 'Request this Service' })).toBeVisible({ timeout: 10_000 })

  // Once the owner accepts the first handshake, the same second requester should see the offer as full.
  await switchUser(page, owner)
  await acceptPendingHandshakeViaApi(page, {
    serviceId: created.id,
    requesterName: requesterOne.name,
  })

  await switchUser(page, requesterTwo)
  await page.goto(created.detailUrl)
  await expect(page.getByRole('button', { name: 'Request this Service' })).toHaveCount(0)
})
