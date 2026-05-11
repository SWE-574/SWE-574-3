import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'
import {
  createEvent,
  cancelEventViaApi,
  FEATURE_11_USERS,
} from '../helpers/feature11'

/**
 * FR-11d — Organizer can cancel a published event. Cancelled events render
 * with a cancelled status indicator on the detail page.
 */

test('FR-11d: organizer can cancel an event', async ({ page }) => {
  await loginAs(page, FEATURE_11_USERS.organizer)
  const event = await createEvent(page)

  await cancelEventViaApi(page, event.id)
  await page.goto(event.detailUrl)
  await expect(page.getByText(/cancel(led|ed)/i).first()).toBeVisible()
})
