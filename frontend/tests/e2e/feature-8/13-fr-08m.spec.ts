import { test, expect } from '@playwright/test'

import {
  createOffer,
  initiateOnlineHandshakeViaApi,
  loginAs,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  requestOfferFromDetail,
  switchUser,
  USERS,
} from '../helpers'

test('FR-08m: websocket notifications surface representative handshake state transitions in real time', async ({ browser, page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const title = `FR-08m Offer ${Date.now()}`

  const ownerWatcherContext = await browser.newContext({
    baseURL: 'http://localhost:5173',
  })
  const ownerWatcherPage = await ownerWatcherContext.newPage()

  try {
    // Keep the provider on the notifications page so websocket-driven store updates have a visible surface.
    await loginAs(ownerWatcherPage, owner)
    await ownerWatcherPage.goto('/notifications')
    await expect(ownerWatcherPage.getByText(/Notifications/i).first()).toBeVisible({ timeout: 10_000 })
    await ownerWatcherPage.waitForTimeout(1500)

    // A requester creates the pending handshake, which should appear as a live notification.
    await loginAs(page, owner)
    const { detailUrl } = await createOffer(page, {
      title,
      description: 'Feature 8 FR-08m verifies websocket transition notifications.',
      duration: 1,
      online: true,
    })

    await switchUser(page, requester)
    await page.goto(detailUrl)
    await requestOfferFromDetail(page)
    await expect(ownerWatcherPage.getByText(/New Interest in Your Service/i).first()).toBeVisible({ timeout: 10_000 })

    // Open the live conversation surface before the approval transition happens.
    await ownerWatcherPage.goto('/messages')
    await openConversationForService(ownerWatcherPage, title)
    await expect(ownerWatcherPage.getByText(title).first()).toBeVisible({ timeout: 10_000 })

    // After the requester approves the proposed session, the provider should see the accepted transition in the open thread.
    await switchUser(page, owner)
    await initiateOnlineHandshakeViaApi(page, {
      serviceTitle: title,
      requesterName: requester.name,
      duration: 1,
      meetingLink: 'https://meet.example.com/fr-08m',
    })

    await switchUser(page, requester)
    await openConversationForService(page, title)
    await page.getByRole('button', { name: 'Review & Approve' }).click()
    await page.getByRole('button', { name: 'Approve & Confirm' }).click()

    await expect(ownerWatcherPage.getByText(/Session approved!/i).first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await ownerWatcherContext.close()
  }
})
