import { test, expect } from '@playwright/test'

import {
  approvePendingHandshakeViaApi,
  createNeed,
  initiateOnlineSessionAsOwner,
  loginAs,
  openConversationForService,
  requestOfferFromDetail,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('FR-06e: request owner sees edit lock once an approved exchange is active', async ({ page }) => {
  const title = uniqueTitle('FR-06e Need')

  // Create the original request as the owner.
  await loginAs(page, USERS.elif)
  const { detailUrl } = await createNeed(page, {
    title,
    description: 'Feature 6 FR-06e initial request description.',
  })

  // Another user responds so the owner edits while an application already exists.
  await switchUser(page, USERS.mehmet)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  // Move the exchange to accepted through the real chat-based handshake flow.
  await switchUser(page, USERS.elif)
  await openConversationForService(page, title)
  await initiateOnlineSessionAsOwner(page, {
    serviceTitle: title,
    requesterName: USERS.mehmet.name,
    daysAhead: 5,
  })

  await switchUser(page, USERS.mehmet)
  await openConversationForService(page, title)
  await approvePendingHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: USERS.mehmet.name,
  })

  // Once the request is approved, the owner should stay on the detail page and see the edit lock.
  await switchUser(page, USERS.elif)
  await page.goto(detailUrl)
  const editButton = page.getByRole('button', { name: 'Edit Listing' })
  await expect(editButton).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Editing is locked while an approved session is still active\./i)).toBeVisible({
    timeout: 10_000,
  })

  await editButton.click()
  await expect(page).toHaveURL(new RegExp(detailUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10_000 })
})
