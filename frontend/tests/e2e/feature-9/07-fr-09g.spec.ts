import { test, expect } from '@playwright/test'

import {
  createOffer,
  loginAs,
  requestOfferFromDetail,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('FR-09g: manual completion fallback is hidden until the handshake is accepted', async ({ page }) => {
  // The Mark-as-Complete fallback (#300) is only meaningful once both
  // sides have agreed to the exchange. While a request is still pending
  // the owner should see Accept / Decline, not the fallback — surfacing
  // the button earlier would invite mid-negotiation completions and
  // leak time credits before any service was actually delivered.
  // FR-13m covers the positive (accepted-state) path end to end.
  const owner = USERS.elif
  const requester = USERS.cem
  const title = uniqueTitle('FR-09g pending')

  await loginAs(page, owner)
  const { detailUrl } = await createOffer(page, {
    title,
    description: 'Feature 9 FR-09g asserts the fallback is gated on accepted state.',
  })

  await switchUser(page, requester)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  // Pending state — Accept and Decline must be visible, Mark as Complete
  // must NOT be (the row reads `status === 'pending'`).
  await switchUser(page, owner)
  await page.goto(detailUrl)
  await expect(page.getByText('Accept')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Decline')).toBeVisible()
  await expect(page.getByTestId('mark-as-complete-button')).toHaveCount(0)
})
