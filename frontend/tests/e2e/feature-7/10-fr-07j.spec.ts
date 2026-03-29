import { test, expect } from '@playwright/test'

import {
  createOffer,
  getCurrentBalance,
  listTransactions,
  loginAs,
  pickUsersWithBalanceAtLeast,
  requestOfferFromDetail,
  USERS,
} from '../helpers'

test('FR-07j: concurrent requester actions do not deduct the same balance twice', async ({ browser, page }) => {
  const owner = USERS.burak
  const title = `FR-07j Offer ${Date.now()}`

  // Pick a requester with one available hour so a duplicate deduction would be obvious.
  const [{ user: requester, balance: startingBalance }] = await pickUsersWithBalanceAtLeast(
    page,
    1,
    1,
    [owner.email],
  )

  // Create a one-hour offer that the requester will try to claim concurrently from two sessions.
  await loginAs(page, owner)
  const { detailUrl } = await createOffer(page, {
    title,
    description: 'Feature 7 FR-07j validates duplicate-deduction protection under concurrent requests.',
    duration: 1,
    online: true,
  })

  const firstContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
  })
  const secondContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
  })
  const firstPage = await firstContext.newPage()
  const secondPage = await secondContext.newPage()

  try {
    await loginAs(firstPage, requester)
    await loginAs(secondPage, requester)

    await firstPage.goto(detailUrl)
    await secondPage.goto(detailUrl)

    // Fire the same requester action from two independent browser sessions at nearly the same time.
    await Promise.allSettled([
      requestOfferFromDetail(firstPage),
      requestOfferFromDetail(secondPage),
    ])

    // The requester balance must never be deducted more than once and the ledger must avoid duplicates.
    await firstPage.goto('/notifications')
    const currentBalance = await getCurrentBalance(firstPage)
    expect(currentBalance).toBeGreaterThanOrEqual(startingBalance - 1)

    const transactions = await listTransactions(firstPage)
    const relatedRows = transactions.results.filter((transaction) => transaction.service_title === title)
    expect(relatedRows.length).toBeLessThanOrEqual(1)
  } finally {
    await firstContext.close()
    await secondContext.close()
  }
})
