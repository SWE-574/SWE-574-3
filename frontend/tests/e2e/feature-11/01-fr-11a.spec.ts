import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'
import { createEvent, FEATURE_11_USERS } from '../helpers/feature11'

/**
 * FR-11a — A signed-in user can create an Event with a future scheduled time
 * and a participant cap. After publish, the event appears on the user's
 * dashboard and at the detail URL.
 */

test('FR-11a: organizer can publish a future event', async ({ page }) => {
  await loginAs(page, FEATURE_11_USERS.organizer)
  const event = await createEvent(page, {
    durationHours: 2,
    maxParticipants: 5,
  })

  await expect(page.getByText(event.title).first()).toBeVisible()
  expect(event.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(event.detailUrl).toContain(event.id)
})
