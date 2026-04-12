import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  initiateOnlineHandshakeViaApi,
  loginAs,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  USERS,
} from '../helpers'

test('FR-08e: requester approval moves the exchange to accepted and notifies the provider in real time', async ({ browser, page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const title = `FR-08e Offer ${Date.now()}`

  await createPendingOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  // The owner proposes a session before both sides open their live surfaces.
  await loginAs(page, owner)
  await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration: 1,
    meetingLink: 'https://meet.example.com/fr-08e',
  })

  const ownerContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
  })
  const requesterContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
  })
  const ownerPage = await ownerContext.newPage()
  const requesterPage = await requesterContext.newPage()

  try {
    // Provider keeps the conversation open while the requester approves from the chat flow.
    await loginAs(ownerPage, owner)
    await openConversationForService(ownerPage, title)
    await expect(ownerPage.getByText(/Session details sent/i).first()).toBeVisible({ timeout: 10_000 })

    await loginAs(requesterPage, requester)
    await openConversationForService(requesterPage, title)
    await requesterPage.getByRole('button', { name: 'Review & Approve' }).click()
    await requesterPage.getByRole('button', { name: 'Approve & Confirm' }).click()

    // The requester should move into the accepted state immediately.
    await expect(requesterPage.getByText(/Confirm the service is done|You pay/i).first()).toBeVisible({ timeout: 10_000 })

    // The provider should see the accepted transition propagate into the open thread without reloading.
    await expect(ownerPage.getByText(/Session approved!/i).first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await ownerContext.close()
    await requesterContext.close()
  }
})
