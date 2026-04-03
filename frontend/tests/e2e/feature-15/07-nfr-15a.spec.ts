import { test, expect } from '@playwright/test'
import {
  loginAs,
  switchUser,
  uniqueTitle,
  USERS,
  createEventViaApi,
  joinEventViaApi,
  setupAttendedEventHandshake,
} from '../helpers'

test('NFR-15a: event evaluations are accepted only from verified eligible participants — ineligible API calls are rejected', async ({ page }) => {
  const title = uniqueTitle('NFR-15a Event')
  const organizer = USERS.elif
  const attended = USERS.cem
  const notJoined = USERS.burak

  // One participant reaches attended state; another is not even joined.
  const { event, handshakeId: attendedHandshakeId } = await setupAttendedEventHandshake(page, {
    organizer,
    participant: attended,
    title,
  })

  // Non-participant guesses the attended handshake id and tries to evaluate.
  await switchUser(page, notJoined)
  const spoofResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true, engaging: true, welcoming: true }),
    })
    return { status: r.status }
  }, { handshakeId: attendedHandshakeId })

  // Must not succeed (403 or 404).
  expect([403, 404]).toContain(spoofResult.status)

  // Unauthenticated caller must also be refused.
  await page.context().clearCookies()
  const anonResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true, engaging: true, welcoming: true }),
    })
    return { status: r.status }
  }, { handshakeId: attendedHandshakeId })

  expect([401, 403]).toContain(anonResult.status)
})
