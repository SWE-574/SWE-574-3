import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'
import {
  createEvent,
  expressInterestViaApi,
  asUser,
  FEATURE_11_USERS,
} from '../helpers/feature11'

/**
 * FR-11b — Another user can express interest in a published event and the
 * organizer sees the resulting handshake on the event detail page.
 */

test('FR-11b: attendee can express interest in an event', async ({ page }) => {
  await loginAs(page, FEATURE_11_USERS.organizer)
  const event = await createEvent(page, { maxParticipants: 4 })

  await asUser(page, FEATURE_11_USERS.attendeeA, async () => {
    const handshakeId = await expressInterestViaApi(page, event.id)
    expect(handshakeId).toMatch(/^[0-9a-f-]{36}$/)
  })

  await loginAs(page, FEATURE_11_USERS.organizer)
  await page.goto(event.detailUrl)
  await expect(
    page.getByText(new RegExp(`${FEATURE_11_USERS.attendeeA.name}|expressed interest|pending`, 'i')).first(),
  ).toBeVisible()
})
