import { test, expect } from '@playwright/test'

import {
  completeOfferExchange,
  createAcceptedGroupOfferExchanges,
  expectBalanceToBe,
  getCurrentBalance,
  listTransactions,
  openTimeActivity,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-07e: group offers transfer hours only on first completion and burn later reserved hours', async ({ page }) => {
  const owner = USERS.yasemin

  // Pick two distinct requesters who can both reserve the group session hour.
  const picked = await pickUsersWithBalanceAtLeast(page, 1, 2, [owner.email])
  const requesters = picked.map((entry) => entry.user)

  // Capture the provider balance before any completion happens.
  await switchUser(page, owner)
  const providerStartingBalance = await getCurrentBalance(page)

  // Create a one-time group offer, accept both participants, then complete both handshakes.
  const { title } = await createAcceptedGroupOfferExchanges(page, {
    owner,
    requesters,
    title: `FR-07e Group Offer ${Date.now()}`,
    duration: 1,
  })

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

  // The provider should only gain one hour overall even though two participants completed.
  await switchUser(page, owner)
  await expectBalanceToBe(page, providerStartingBalance + 1)

  // Poll the ledger until the transfer movement appears, then assert there's
  // at most one (group offers must not double-credit the provider).
  await expect.poll(async () => {
    const txs = await listTransactions(page, 'credit')
    return txs.results.filter((transaction) => (
      transaction.service_title === title && transaction.transaction_type === 'transfer'
    )).length
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(1)

  const transactions = await listTransactions(page, 'credit')
  const relatedTransfers = transactions.results.filter((transaction) => (
    transaction.service_title === title && transaction.transaction_type === 'transfer'
  ))
  expect(relatedTransfers.length).toBeLessThanOrEqual(1)

  await openTimeActivity(page)
  await expect(page.getByRole('button', { name: 'Earned' })).toBeVisible()
})
