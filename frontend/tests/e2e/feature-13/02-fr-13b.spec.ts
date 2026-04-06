import { test, expect } from '@playwright/test'

import { createServiceViaApi, loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-13b: detail page shows the poster profile summary with name, karma, and member-since data', async ({ page }) => {
  const title = uniqueTitle('FR-13b Offer')

  // Create a listing as a seeded user whose public profile metadata is already available.
  await loginAs(page, USERS.elif)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 FR-13b checks the poster summary card on the detail page.',
    duration: 1,
    locationType: 'Online',
  })

  // The poster summary should expose identity and reputation cues without opening the profile page.
  await page.goto(created.detailUrl)
  await expect(page.getByText(USERS.elif.name).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/^Karma$/).first()).toBeVisible()
  await expect(page.getByText(/^Joined$/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /View Profile/i }).first()).toBeVisible()
})
