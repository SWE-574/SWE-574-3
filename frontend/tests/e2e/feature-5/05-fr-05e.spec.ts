import { test, expect } from '@playwright/test'
import {
  approvePendingHandshakeViaApi,
  createOffer,
  initiateOnlineSessionAsOwner,
  loginAs,
  openConversationForService,
  requestOfferFromDetail,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('FR-05e: group offer owner sees edit lock once an approved exchange is active', async ({ page }) => {
  const title = uniqueTitle('FR-05e Offer')

  // Create a simple online offer so the approval flow can be completed through chat.
  await loginAs(page, USERS.elif)
  const { detailUrl } = await createOffer(page, {
    title,
    description: 'Feature 5 FR-05e initial description for editable online offer.',
    duration: 1,
    online: true,
  })

  // A second user creates an incoming exchange on the offer.
  await switchUser(page, USERS.mehmet)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  // Move the exchange to accepted through the real chat-based handshake flow.
  await switchUser(page, USERS.elif)
  await openConversationForService(page, title)
  await initiateOnlineSessionAsOwner(page, {
    serviceTitle: title,
    requesterName: USERS.mehmet.name,
  })

  await switchUser(page, USERS.mehmet)
  await openConversationForService(page, title)
  await approvePendingHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: USERS.mehmet.name,
  })

  // The owner should remain on detail page and see the edit lock instead of the edit form.
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
