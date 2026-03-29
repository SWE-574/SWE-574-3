import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  fetchHandshake,
  findHandshakeId,
  getCurrentBalance,
  initiateOnlineHandshakeViaApi,
  loginAs,
  pickUsersWithBalanceAtLeast,
  postHandshakeAction,
  switchUser,
  USERS,
} from '../helpers'

test('NFR-08c: competing transition requests resolve to a single consistent final state', async ({ browser, page }) => {
  const owner = USERS.elif
  const [{ user: requester, balance: startingBalance }] = await pickUsersWithBalanceAtLeast(
    page,
    2,
    1,
    [owner.email],
  )
  const title = `NFR-08c Offer ${Date.now()}`

  await createPendingOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  await switchUser(page, owner)
  await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration: 1,
    meetingLink: 'https://meet.example.com/nfr-08c',
  })

  const handshakeId = await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requester.name,
    status: 'pending',
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
    await loginAs(ownerPage, owner)
    await loginAs(requesterPage, requester)

    // Fire approve and cancel against the same pending handshake at nearly the same time.
    const [approveResult, cancelResult] = await Promise.all([
      postHandshakeAction(requesterPage, handshakeId, 'approve'),
      postHandshakeAction(ownerPage, handshakeId, 'cancel'),
    ])

    const successCount = [approveResult, cancelResult].filter((result) => result.ok).length
    expect(successCount).toBeLessThanOrEqual(1)

    // The handshake must settle into one valid state with a matching balance outcome.
    const finalHandshake = await fetchHandshake(ownerPage, handshakeId)
    expect(['accepted', 'cancelled']).toContain(finalHandshake.status)

    await switchUser(page, requester)
    const requesterBalance = await getCurrentBalance(page)

    if (finalHandshake.status === 'accepted') {
      expect(requesterBalance).toBe(startingBalance - 1)
    } else {
      expect(requesterBalance).toBe(startingBalance)
    }
  } finally {
    await ownerContext.close()
    await requesterContext.close()
  }
})
