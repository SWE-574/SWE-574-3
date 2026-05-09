import { test } from '@playwright/test'

import {
  completeOfferExchange,
  createAcceptedOfferExchange,
  expectBalanceToBe,
  findLedgerTransaction,
  getCurrentBalance,
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
  await expectBalanceToBe(page, providerBeforeCompletion + 1)

  // The requester should keep the already-reserved post-accept balance.
  await switchUser(page, requester)
  await expectBalanceToBe(page, requesterBeforeCompletion)

  // The transfer row is recorded for the provider, not the requester.
  await switchUser(page, owner)
  await findLedgerTransaction(
    page,
    (transaction) => transaction.service_title === title && transaction.transaction_type === 'transfer',
  )
})
