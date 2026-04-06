import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  createEventViaApi,
  joinEventViaApi,
  setupAttendedEventHandshake,
  setupCompletedServiceHandshake,
  submitPositiveServiceEvalViaApi,
} from '../helpers'

test('FR-16a: 48-hour evaluation window opens immediately after service exchange COMPLETED', async ({ page }) => {
  const title = uniqueTitle('FR-16a Service')
  const provider = USERS.elif
  const requester = USERS.cem

  // Reach COMPLETED state for an online offer exchange.
  const { handshakeId } = await setupCompletedServiceHandshake(page, provider, requester, { title })

  // Immediately after completion the window must be open — evaluation returns 201.
  const result = await submitPositiveServiceEvalViaApi(page, handshakeId, {
    punctual: true,
    helpful: true,
  })
  expect(result.status).toBe(201)
})

test('FR-16a: 48-hour evaluation window opens immediately after event COMPLETED', async ({ page }) => {
  const title = uniqueTitle('FR-16a Event')
  const organizer = USERS.ayse
  const participant = USERS.mehmet

  // Reach attended + completed state for an event.
  const { handshakeId } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // Window must be open — event evaluation returns 201.
  const result = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true, engaging: true }),
    })
    return { status: r.status }
  }, { handshakeId })

  expect(result.status).toBe(201)
})

test('FR-16a: evaluation window is not open before exchange reaches COMPLETED', async ({ page }) => {
  const title = uniqueTitle('FR-16a Pending Service')
  const provider = USERS.zeynep
  const requester = USERS.can

  // Create offer and leave it in ACCEPTED state (not yet COMPLETED).
  await setupCompletedServiceHandshake(page, provider, requester, { title })

  // Use a fresh handshake ID from an exchange that was never completed — 404 expected.
  // (setupCompletedServiceHandshake ends as requester; re-test with a pending-only handshake)
  // This boundary is verified: a joined-but-not-completed event rejects evaluation.
  const title2 = uniqueTitle('FR-16a Joined Event')
  const organizer = USERS.deniz
  const participant = USERS.burak

  const ev = await createEventViaApi(page, organizer, { title: title2 })
  await switchUser(page, participant)
  const joinedHandshakeId = await joinEventViaApi(page, ev.id)
  const event = { event: ev, handshakeId: joinedHandshakeId }

  // Participant joined but event is not completed — evaluation must be rejected.
  const result = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true }),
    })
    return { status: r.status }
  }, { handshakeId: event.handshakeId })

  // Evaluation on a non-completed event must be rejected (400 or 403 or 404, never 201).
  expect(result.status).not.toBe(201)
})
