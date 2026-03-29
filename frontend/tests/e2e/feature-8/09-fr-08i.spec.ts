import { test, expect } from '@playwright/test'

import {
  completeOfferExchange,
  createAcceptedOfferExchange,
  getCurrentBalance,
  listTransactions,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-08i: completing a one-to-one exchange transfers the reserved hours from requester to provider', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const title = `FR-08i Offer ${Date.now()}`

  await createAcceptedOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  // Capture the accepted-state balances before completion releases the reserved hour.
  await switchUser(page, owner)
  const providerBeforeCompletion = await getCurrentBalance(page)

  await switchUser(page, requester)
  const requesterBeforeCompletion = await getCurrentBalance(page)

  await completeOfferExchange(page, {
    owner,
    requester,
    serviceTitle: title,
  })

  // The provider should receive the released hour.
  await switchUser(page, owner)
  const providerAfterCompletion = await getCurrentBalance(page)
  expect(providerAfterCompletion).toBe(providerBeforeCompletion + 1)

  // The requester should keep the already-reserved post-accept balance.
  await switchUser(page, requester)
  const requesterAfterCompletion = await getCurrentBalance(page)
  expect(requesterAfterCompletion).toBe(requesterBeforeCompletion)

  // The transfer row is recorded for the provider, not the requester.
  await switchUser(page, owner)
  const transactions = await listTransactions(page)
  const transferRow = transactions.results.find((transaction) => (
    transaction.service_title === title && transaction.transaction_type === 'transfer'
  ))
  expect(transferRow).toBeTruthy()
})
