import { test, expect } from '@playwright/test'
import {
  loginAs,
  switchUser,
  uniqueTitle,
  USERS,
  createEventViaApi,
  joinEventViaApi,
  markAttendedViaApi,
} from '../helpers'

test('FR-15c: organizer can manually override CHECK-IN to ATTENDED as fallback when QR fails', async ({ page }) => {
  const title = uniqueTitle('FR-15c Event')
  const organizer = USERS.zeynep
  const participant = USERS.can

  // Participant joins the event.
  const event = await createEventViaApi(page, organizer, { title })

  await switchUser(page, participant)
  const handshakeId = await joinEventViaApi(page, event.id)

  // Manually force the handshake to checked_in so mark-attended is valid.
  // (In production QR scan does this; here we patch status directly via checkin API.)
  await page.evaluate(async ({ handshakeId }) => {
    await fetch(`/api/handshakes/${handshakeId}/checkin/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  }, { handshakeId })

  // Organizer overrides via mark-attended endpoint (fallback path).
  await switchUser(page, organizer)
  await markAttendedViaApi(page, handshakeId)

  // Participant can now submit a positive evaluation — status is attended.
  await switchUser(page, participant)
  const evalResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true, engaging: true, welcoming: true }),
    })
    return { status: r.status }
  }, { handshakeId })

  expect(evalResult.status).toBe(201)
})
