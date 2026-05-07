import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers'
import {
  createEvent,
  expressInterestViaApi,
  markAttendedViaApi,
  asUser,
  FEATURE_11_USERS,
} from '../helpers/feature11'

/**
 * FR-11c — Organizer can mark a participant as attended; the participant
 * sees the attended badge on their copy of the event.
 */

test('FR-11c: organizer can mark a participant attended', async ({ page }) => {
  await loginAs(page, FEATURE_11_USERS.organizer)
  const event = await createEvent(page, { maxParticipants: 4 })

  const handshakeId = await asUser(page, FEATURE_11_USERS.attendeeA, () =>
    expressInterestViaApi(page, event.id),
  )

  await loginAs(page, FEATURE_11_USERS.organizer)
  await markAttendedViaApi(page, handshakeId)

  await asUser(page, FEATURE_11_USERS.attendeeA, async () => {
    await page.goto(event.detailUrl)
    await expect(page.getByText(/attended/i).first()).toBeVisible()
  })
})
