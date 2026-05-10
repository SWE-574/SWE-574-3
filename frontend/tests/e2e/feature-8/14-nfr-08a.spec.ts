import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  initiateOnlineHandshakeViaApi,
  loginAs,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  USERS,
} from '../helpers'

test('NFR-08a: accepted-state propagation reaches the other party within two seconds when both sides are subscribed', async ({ browser, page }) => {
  // The 2s NFR is a steady-state propagation budget. The previous skip
  // reason measured the cost of opening two cold browser contexts +
  // navigating to the chat + WS handshake + the actual broadcast inside
  // the same 2.3s envelope. That conflates UI cold start with the
  // broadcast itself.
  //
  // The fix here is a receiver-side warm-up: round-trip a message
  // through the watcher's OWN input so we know its WS is connected
  // before we time the approve broadcast. If the watcher's WS were
  // still cold, the warm-up wouldn't land within its 10s envelope.
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

    // Pre-warm the watcher's WS subscription: send a chat message from the
    // requester and wait for it to round-trip to the watcher. Once that
    // lands, both sides' WS are confirmed live and the NFR-08a measurement
    // below times only the steady-state state-propagation cost. We assert
    // the composer is visible (rather than skipping the warm-up when it
    // isn't) so a regression in the chat surface fails fast here instead
    // of silently regressing the test back to measuring cold-subscribe time.
    const requesterInput = requesterPage.getByPlaceholder(/Write a message/i)
    await expect(requesterInput).toBeVisible({ timeout: 10_000 })
    const warmup = `NFR-08a warmup ${Date.now()}`
    await requesterInput.fill(warmup)
    await requesterInput.press('Enter')
    await expect(ownerWatcherPage.getByText(warmup).first()).toBeVisible({ timeout: 10_000 })

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
