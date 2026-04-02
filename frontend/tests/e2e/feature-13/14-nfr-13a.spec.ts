import { test, expect } from '@playwright/test'

import { createServiceViaApi, loginAs, uniqueTitle, USERS } from '../helpers'

test('NFR-13a: detail page loads within 2 seconds under normal load', async ({ page }) => {
  const title = uniqueTitle('NFR-13a Offer')

  // Create a lightweight listing first so we can measure only the visible detail-page load.
  await loginAs(page, USERS.elif)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 NFR-13a measures detail-page load time.',
    duration: 1,
    locationType: 'Online',
  })

  // Measure navigation-to-first-meaningful-proof on the detail page.
  const startedAt = Date.now()
  await page.goto(created.detailUrl)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  const elapsedMs = Date.now() - startedAt

  expect(elapsedMs).toBeLessThanOrEqual(2_000)
})
