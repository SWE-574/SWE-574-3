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
 *
 * The event must be inside the 24-hour check-in window so the participant's
 * `checkin/` call lands the handshake in `checked_in` (which is the only
 * status mark-attended will accept for non-QR events).
 */

test('FR-11c: organizer can mark a participant attended', async ({ page }) => {
  await loginAs(page, FEATURE_11_USERS.organizer)
  const event = await createEvent(page, {
    maxParticipants: 4,
    scheduledAt: new Date(Date.now() + 30 * 60 * 1_000),
  })

  const handshakeId = await asUser(page, FEATURE_11_USERS.attendeeA, async () => {
    const id = await expressInterestViaApi(page, event.id)
    // Move the handshake into checked_in so the organizer's mark-attended
    // call (which requires checked_in for non-QR events) can succeed.
    await page.evaluate(async ({ id }) => {
      await fetch(`/api/handshakes/${id}/checkin/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
    }, { id })
    return id
  })

  await loginAs(page, FEATURE_11_USERS.organizer)
  await markAttendedViaApi(page, handshakeId)

  await asUser(page, FEATURE_11_USERS.attendeeA, async () => {
    await page.goto(event.detailUrl)
    await expect(page.getByText(/attended/i).first()).toBeVisible()
  })
})
