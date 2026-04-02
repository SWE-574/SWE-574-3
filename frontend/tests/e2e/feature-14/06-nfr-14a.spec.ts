import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupCompletedExchange,
} from '../helpers'

test('NFR-14a: only users party to a completed exchange can access the evaluation CTA', async ({ page }) => {
  const title = uniqueTitle('NFR-14a Offer')
  const provider = USERS.mehmet
  const requester = USERS.ayse
  const thirdParty = USERS.burak

  // Reach completed state; page ends logged in as provider.
  const { serviceDetailUrl } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  // Third-party user views the service detail page — they are not part of the exchange.
  await switchUser(page, thirdParty)
  await page.goto(serviceDetailUrl)

  // "Leave Evaluation" must NOT be visible for a non-party user.
  await expect(page.getByText(/Leave Evaluation/i)).not.toBeVisible({ timeout: 10_000 })
})
