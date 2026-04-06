import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  initiateOnlineHandshakeViaApi,
  loginAs,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  USERS,
} from '../helpers'

test('NFR-08a: accepted-state propagation reaches the other party within two seconds under normal load', async ({ browser, page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const title = `NFR-08a Offer ${Date.now()}`

  await createPendingOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  await loginAs(page, owner)
  await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration: 1,
    meetingLink: 'https://meet.example.com/nfr-08a',
  })

  const ownerWatcherContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
  })
  const requesterContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
  })
  const ownerWatcherPage = await ownerWatcherContext.newPage()
  const requesterPage = await requesterContext.newPage()

  try {
    // One side keeps the pending thread open while the requester approves the session.
    await loginAs(ownerWatcherPage, owner)
    await openConversationForService(ownerWatcherPage, title)
    await expect(ownerWatcherPage.getByText(/Session details sent/i).first()).toBeVisible({ timeout: 10_000 })

    await loginAs(requesterPage, requester)
    await openConversationForService(requesterPage, title)
    await requesterPage.getByRole('button', { name: 'Review & Approve' }).click()

    const startedAt = Date.now()
    await requesterPage.getByRole('button', { name: 'Approve & Confirm' }).click()
    await expect(ownerWatcherPage.getByText(/Session approved!/i).first()).toBeVisible({ timeout: 2_000 })

    const elapsedMs = Date.now() - startedAt
    expect(elapsedMs).toBeLessThanOrEqual(2_300)
  } finally {
    await ownerWatcherContext.close()
    await requesterContext.close()
  }
})
