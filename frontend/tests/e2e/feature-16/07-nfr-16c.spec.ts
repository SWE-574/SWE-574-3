import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupAttendedEventHandshake,
  setupCompletedServiceHandshake,
} from '../helpers'

test('NFR-16c: non-participant cannot submit service evaluation via direct API call', async ({ page }) => {
  const title = uniqueTitle('NFR-16c Service')
  const provider = USERS.elif
  const requester = USERS.cem

  // Reach COMPLETED state.
  const { handshakeId } = await setupCompletedServiceHandshake(page, provider, requester, { title })

  // A third party (not part of the exchange) attempts a direct API evaluation.
  await switchUser(page, USERS.deniz)
  const result = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, punctual: true }),
    })
    return { status: r.status }
  }, { handshakeId })

  // Backend must block the outsider — 403 or 404, never 201.
  expect(result.status).not.toBe(201)
  expect([403, 404]).toContain(result.status)
})

test('NFR-16c: non-attendee cannot submit event evaluation via direct API call', async ({ page }) => {
  const title = uniqueTitle('NFR-16c Event')
  const organizer = USERS.ayse
  const participant = USERS.mehmet

  // Reach attended + completed state.
  const { handshakeId } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // An outsider attempts a direct API evaluation bypassing the UI.
  await switchUser(page, USERS.burak)
  const result = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true }),
    })
    return { status: r.status }
  }, { handshakeId })

  expect(result.status).not.toBe(201)
  expect([403, 404]).toContain(result.status)
})

test('NFR-16c: organizer cannot self-evaluate their own event via direct API call', async ({ page }) => {
  const title = uniqueTitle('NFR-16c Self Eval')
  const organizer = USERS.zeynep
  const participant = USERS.can

  // Reach attended + completed state.
  const { handshakeId } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // Organizer attempts to evaluate themselves via direct API.
  await switchUser(page, organizer)
  const result = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true }),
    })
    return { status: r.status }
  }, { handshakeId })

  // Self-evaluation must be blocked.
  expect(result.status).not.toBe(201)
  expect([400, 403, 404]).toContain(result.status)
})

test('NFR-16c: unauthenticated evaluation attempt is blocked with 401 or redirect', async ({ page }) => {
  const title = uniqueTitle('NFR-16c Unauth')
  const organizer = USERS.elif
  const participant = USERS.cem

  // Reach attended + completed state.
  const { handshakeId } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // Clear session and attempt direct API call without auth.
  await page.context().clearCookies()
  const result = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true }),
    })
    return { status: r.status }
  }, { handshakeId })

  // Unauthenticated POST must be rejected.
  expect(result.status).not.toBe(201)
  expect([401, 403]).toContain(result.status)
})
