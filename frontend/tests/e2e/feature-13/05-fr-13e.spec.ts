import { test, expect } from '@playwright/test'

import {
  createServiceViaApi,
  findHandshakeId,
  loginAs,
  openChatFromServiceDetail,
  pickUsersWithBalanceAtLeast,
  requestOfferFromDetail,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('FR-13e: triggering the detail-page action creates a pending exchange and opens the private chat thread', async ({ page }) => {
  const title = uniqueTitle('FR-13e Offer')
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 1, 1, [owner.email])

  // Create a simple offer whose main action will be exercised from the detail page.
  await loginAs(page, owner)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 FR-13e verifies handshake creation from the detail page action.',
    duration: 1,
    locationType: 'Online',
  })

  // The requester uses the action button from detail, then jumps into the generated private thread.
  await switchUser(page, requester)
  await page.goto(created.detailUrl)
  await requestOfferFromDetail(page)

  const handshakeId = await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requester.name,
    status: 'pending',
  })

  await expect(page.getByRole('button', { name: 'View Chat (Pending)' })).toBeVisible({ timeout: 10_000 })
  await openChatFromServiceDetail(page)
  await expect(page).toHaveURL(new RegExp(`/messages(?:/${handshakeId})?`), { timeout: 15_000 })
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
})
