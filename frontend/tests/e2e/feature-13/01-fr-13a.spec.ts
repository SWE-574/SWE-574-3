import { test, expect } from '@playwright/test'

import { createServiceViaApi, loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-13a: detail page shows core listing details including schedule, capacity, tags, and creation metadata', async ({ page }) => {
  const title = uniqueTitle('FR-13a Event')

  // Recurrence is Event-only now, so pick a recurrent Event to exercise schedule, capacity,
  // tags, location and creation metadata in one detail-page render. Events require a future
  // scheduled_time (enforced at the view layer).
  const scheduledTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 16)
  await loginAs(page, USERS.elif)
  const created = await createServiceViaApi(page, {
    type: 'Event',
    title,
    description: 'Feature 13 FR-13a verifies the core detail-page metadata rendering.',
    duration: 2,
    locationType: 'Online',
    locationArea: 'Zoom',
    maxParticipants: 3,
    scheduleType: 'Recurrent',
    scheduledTime,
    tagNames: ['Cooking'],
  })

  // Open the detail page and verify the minimum user-visible proof for each major metadata block.
  await page.goto(created.detailUrl)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Feature 13 FR-13a verifies the core detail-page metadata rendering.')).toBeVisible()
  await expect(page.getByText('Date & Time').first()).toBeVisible()
  await expect(page.getByText(/Recurring/i).first()).toBeVisible()
  await expect(page.getByText('Online').first()).toBeVisible()
  await expect(page.getByText(/3 left of 3/i).first()).toBeVisible()
  await expect(page.getByText('#Cooking')).toBeVisible()
  await expect(page.getByText(/Posted/i).first()).toBeVisible()
})
