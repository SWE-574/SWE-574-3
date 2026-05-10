import { test, expect } from '@playwright/test'

import {
  createAcceptedOfferExchange,
  expectToast,
  loginAs,
  pickUsersWithBalanceAtLeast,
  USERS,
} from '../helpers'

test('FR-13m: owner Interests panel exposes a manual Mark as Complete fallback for accepted exchanges', async ({ page }) => {
  // #300: when the QR / chat completion path isn't accessible, the owner
  // should still be able to record their half of the dual-confirmation
  // directly from the listing's Interests panel. The button reuses the
  // existing /handshakes/{id}/confirm/ endpoint, so the requester still
  // needs to confirm before time credits actually transfer.
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])

  const { detailUrl } = await createAcceptedOfferExchange(page, {
    owner,
    requester,
    title: `FR-13m Manual Complete ${Date.now()}`,
    duration: 1,
    // FR-13m's eligibility gate is in-person — Online listings already
    // surface the chat-based confirmation and must NOT show the
    // duplicate row-level fallback.
    location: 'in-person',
  })

  // Owner returns to the detail page; the accepted handshake should now
  // surface the manual fallback button on the corresponding interest row.
  await loginAs(page, owner)
  await page.goto(detailUrl)

  const markCompleteButton = page.getByTestId('mark-as-complete-button').first()
  await expect(markCompleteButton).toBeVisible({ timeout: 10_000 })

  // Click the row-level button → the modal confirms before dispatching.
  await markCompleteButton.click()
  await page.getByRole('button', { name: 'Mark Complete' }).click()

  // The owner has only recorded their half of the confirmation, so the
  // toast tells them the requester still needs to confirm. The handshake
  // is also expected to remain in the active list until the requester
  // confirms, but that follow-up assertion belongs in a multi-user spec.
  await expectToast(page, /Awaiting the requester|complete/i)

  // After the owner confirms, the button is hidden so a second click can't
  // double-fire.
  await expect(page.getByTestId('mark-as-complete-button')).toHaveCount(0, { timeout: 10_000 })
})
