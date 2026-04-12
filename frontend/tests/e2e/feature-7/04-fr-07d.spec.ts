import { test, expect } from '@playwright/test'

import {
  completeOfferExchange,
  createAcceptedOfferExchange,
  getCurrentBalance,
  listTransactions,
  openTimeActivity,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-07d: completing a one-to-one exchange transfers reserved hours to the provider', async ({ page }) => {
  const owner = USERS.deniz

  // Pick a requester who can afford the exchange and capture the provider balance before completion.
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 1, 1, [owner.email])
  await switchUser(page, owner)
  const providerStartingBalance = await getCurrentBalance(page)

  // Build an accepted one-to-one offer exchange, then complete it from both sides.
  const { title } = await createAcceptedOfferExchange(page, {
    owner,
    requester,
    title: `FR-07d Offer ${Date.now()}`,
    duration: 1,
  })
  await completeOfferExchange(page, {
    owner,
    requester,
    serviceTitle: title,
  })

  // The provider should now see the transferred hour in both balance and transaction history.
  await switchUser(page, owner)
  const providerCurrentBalance = await getCurrentBalance(page)
  expect(providerCurrentBalance).toBe(providerStartingBalance + 1)

  const transactions = await listTransactions(page, 'credit')
  const relatedTransfer = transactions.results.find((transaction) => (
    transaction.service_title === title && transaction.transaction_type === 'transfer'
  ))
  expect(relatedTransfer).toBeTruthy()

  await openTimeActivity(page)
  await expect(page.getByRole('button', { name: 'Received' })).toBeVisible()
})
