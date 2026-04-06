import { test, expect } from '@playwright/test'

import {
  completeOfferExchange,
  createAcceptedGroupOfferExchanges,
  getCurrentBalance,
  listTransactions,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-08j: only the first completed group-offer exchange transfers hours to the provider', async ({ page }) => {
  const owner = USERS.elif
  const picked = await pickUsersWithBalanceAtLeast(page, 2, 2, [owner.email])
  const requesters = picked.map((entry) => entry.user)
  const title = `FR-08j Group Offer ${Date.now()}`

  await createAcceptedGroupOfferExchanges(page, {
    owner,
    requesters,
    title,
    duration: 1,
  })

  // Start from the provider's accepted-state balance before any participant completes.
  await switchUser(page, owner)
  const providerBeforeCompletions = await getCurrentBalance(page)

  // Complete both participant handshakes through the same flow used by the Time Share group rule.
  await completeOfferExchange(page, {
    owner,
    requester: requesters[0],
    serviceTitle: title,
  })
  await completeOfferExchange(page, {
    owner,
    requester: requesters[1],
    serviceTitle: title,
  })

  await switchUser(page, owner)
  const providerAfterCompletions = await getCurrentBalance(page)
  expect(providerAfterCompletions).toBe(providerBeforeCompletions + 1)

  const transactions = await listTransactions(page, 'credit')
  const relatedTransfers = transactions.results.filter((transaction) => (
    transaction.service_title === title && transaction.transaction_type === 'transfer'
  ))
  expect(relatedTransfers.length).toBeLessThanOrEqual(1)
})
