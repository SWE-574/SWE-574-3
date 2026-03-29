import { test, expect } from '@playwright/test'

import {
  completeOfferExchange,
  createAcceptedOfferExchange,
  listTransactions,
  openTimeActivity,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-07g: each Time Share movement is persisted as a ledger record with traceable fields', async ({ page }) => {
  const owner = USERS.ayse

  // Complete a one-to-one exchange so the ledger definitely records a transfer movement.
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 1, 1, [owner.email])
  const { title } = await createAcceptedOfferExchange(page, {
    owner,
    requester,
    title: `FR-07g Offer ${Date.now()}`,
    duration: 1,
  })
  await completeOfferExchange(page, {
    owner,
    requester,
    serviceTitle: title,
  })
  await switchUser(page, owner)

  // Read the transaction payload and confirm the related service movement has core ledger fields.
  const transactions = await listTransactions(page, 'credit')
  const ledgerRow = transactions.results.find((transaction) => (
    transaction.service_title === title && transaction.transaction_type === 'transfer'
  ))
  expect(ledgerRow).toBeTruthy()
  expect(ledgerRow?.id).toBeTruthy()
  expect(ledgerRow?.service_id).toBeTruthy()
  expect(ledgerRow?.transaction_type).toBeTruthy()
  expect(typeof ledgerRow?.amount).toBe('number')
  expect(ledgerRow?.created_at).toBeTruthy()
  expect(typeof ledgerRow?.balance_after).toBe('number')

  // The same movement should also be visible in the user-facing Time Activity page.
  await openTimeActivity(page)
  await expect(page.getByRole('button', { name: 'Received' })).toBeVisible()
})
