import { test, expect } from '@playwright/test'

import {
  completeOfferExchange,
  createAcceptedOfferExchange,
  fetchCurrentUser,
  listTransactions,
  pickUsersWithBalanceAtLeast,
  openTimeActivity,
  switchUser,
  USERS,
} from '../helpers'

test('NFR-07c: ledger rows and visible balances remain transactionally consistent after a reservation', async ({ page }) => {
  const owner = USERS.can

  // Complete a fresh exchange so both balance and ledger summary can be cross-checked on a real movement.
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 1, 1, [owner.email])
  const { title } = await createAcceptedOfferExchange(page, {
    owner,
    requester,
    title: `NFR-07c Offer ${Date.now()}`,
    duration: 1,
  })
  await completeOfferExchange(page, {
    owner,
    requester,
    serviceTitle: title,
  })
  await switchUser(page, owner)

  // Compare API-visible balance state with the summary and newest ledger row for the same completed exchange.
  const currentUser = await fetchCurrentUser(page)
  const transactions = await listTransactions(page, 'credit')
  const relatedRow = transactions.results.find((transaction) => (
    transaction.service_title === title && transaction.transaction_type === 'transfer'
  ))

  expect(relatedRow).toBeTruthy()
  expect(transactions.summary.current_balance).toBe(currentUser.timebank_balance)
  expect(relatedRow?.balance_after).toBe(currentUser.timebank_balance)

  // The user-facing Time Activity page should render the same reservation without divergence.
  await openTimeActivity(page)
  await expect(page.getByRole('button', { name: 'Received' })).toBeVisible()
})
