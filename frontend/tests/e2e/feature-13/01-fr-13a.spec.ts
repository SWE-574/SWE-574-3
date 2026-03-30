import { test, expect } from '@playwright/test'

import { createServiceViaApi, loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-13a: detail page shows core listing details including schedule, capacity, tags, and creation metadata', async ({ page }) => {
  const title = uniqueTitle('FR-13a Offer')

  // Create a tagged recurring offer so the detail page has all core fields to render.
  await loginAs(page, USERS.elif)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 FR-13a verifies the core detail-page metadata rendering.',
    duration: 2,
    locationType: 'Online',
    locationArea: 'Zoom',
    maxParticipants: 3,
    scheduleType: 'Recurrent',
    scheduleDetails: 'Every Saturday 10:00',
    tagNames: ['Cooking'],
  })

  // Open the detail page and verify the minimum user-visible proof for each major metadata block.
  await page.goto(created.detailUrl)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Feature 13 FR-13a verifies the core detail-page metadata rendering.')).toBeVisible()
  await expect(page.getByText('2 hours').first()).toBeVisible()
  await expect(page.getByText(/Recurrent.*Every Saturday 10:00/i).first()).toBeVisible()
  await expect(page.getByText('Online').first()).toBeVisible()
  await expect(page.getByText(/0\/3 filled/i).first()).toBeVisible()
  await expect(page.getByText('#Cooking')).toBeVisible()
  await expect(page.getByText(/Posted/i).first()).toBeVisible()
})
