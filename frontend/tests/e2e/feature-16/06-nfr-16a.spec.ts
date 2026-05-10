import { test, expect } from '@playwright/test'
import {
  uniqueTitle,
  USERS,
  setupAttendedEventHandshake,
  setupCompletedServiceHandshake,
  submitPositiveServiceEvalViaApi,
} from '../helpers'

test('NFR-16a: duplicate service evaluation from same party is rejected — exactly-once enforced', async ({ page }) => {
  const title = uniqueTitle('NFR-16a Service')
  const provider = USERS.elif
  const requester = USERS.cem

  // Reach COMPLETED state.
  const { handshakeId } = await setupCompletedServiceHandshake(page, provider, requester, { title })

  // First evaluation must succeed.
  const first = await submitPositiveServiceEvalViaApi(page, handshakeId, { punctual: true })
  expect(first.status).toBe(201)

  // Immediate retry must be rejected — the exchange processes exactly once.
  const second = await submitPositiveServiceEvalViaApi(page, handshakeId, { punctual: true })
  expect(second.status).toBe(400)
})

test('NFR-16a: duplicate event evaluation from same attendee is rejected — exactly-once enforced', async ({ page }) => {
  const title = uniqueTitle('NFR-16a Event')
  const organizer = USERS.ayse
  const participant = USERS.mehmet

  // Reach attended + completed state.
  const { handshakeId } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // First event evaluation must succeed.
  const first = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true }),
    })
    return { status: r.status }
  }, { handshakeId })
  expect(first.status).toBe(201)

  // Immediate retry must be rejected.
  const second = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true }),
    })
    return { status: r.status }
  }, { handshakeId })
  expect(second.status).toBe(400)
})

test('NFR-16a: user_has_reviewed flag is set after first submission — UI prevents re-entry', async ({ page }) => {
  const title = uniqueTitle('NFR-16a Flag Event')
  const organizer = USERS.zeynep
  const participant = USERS.can

  // Reach attended + completed state; session as participant.
  const { event, handshakeId } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // Submit via UI.
  await page.goto(event.detailUrl)
  await page.getByRole('button', { name: /Leave Evaluation/i }).first().click()
  await expect(page.getByText('Evaluate Organizer')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Well Organized' }).click()
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()

  // Reload — button must be gone, and handshake API confirms reviewed flag.
  await page.goto(event.detailUrl)
  await expect(page.getByRole('button', { name: /Leave Evaluation/i })).not.toBeVisible({ timeout: 8_000 })

  const handshakeData = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch(`/api/handshakes/${handshakeId}/`, { credentials: 'include' })
    return await r.json() as Record<string, unknown>
  }, { handshakeId })
  expect(handshakeData['user_has_reviewed']).toBe(true)
})
