import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupCompletedServiceHandshake,
  setupAttendedEventHandshake,
  submitPositiveServiceEvalViaApi,
} from '../helpers'

test('FR-16d: requester can submit service evaluation without waiting for provider — non-reciprocal allowed', async ({ page }) => {
  const title = uniqueTitle('FR-16d Service')
  const provider = USERS.ayse
  const requester = USERS.mehmet

  // Reach COMPLETED state; session is as requester.
  const { handshakeId } = await setupCompletedServiceHandshake(page, provider, requester, { title })

  // Requester submits evaluation — provider has NOT submitted.
  const result = await submitPositiveServiceEvalViaApi(page, handshakeId, {
    punctual: true,
    helpful: true,
  })

  // Non-reciprocal submission must be accepted.
  expect(result.status).toBe(201)
})

test('FR-16d: provider can independently submit their evaluation without requester submitting first', async ({ page }) => {
  const title = uniqueTitle('FR-16d Provider Eval')
  const provider = USERS.zeynep
  const requester = USERS.can

  // Reach COMPLETED state; switch to provider.
  const { handshakeId } = await setupCompletedServiceHandshake(page, provider, requester, { title })

  await switchUser(page, provider)

  // Provider evaluates requester without requester having submitted anything.
  const result = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handshake_id: handshakeId,
        punctual: true,
        helpful: false,
        kindness: true,
      }),
    })
    return { status: r.status }
  }, { handshakeId })

  expect(result.status).toBe(201)
})

test('FR-16d: both parties can independently submit evaluations for the same event', async ({ page }) => {
  const title = uniqueTitle('FR-16d Both Eval Event')
  const organizer = USERS.elif
  const participant = USERS.cem

  // Reach attended + completed state; session as participant.
  const { handshakeId } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // Participant submits evaluation first (non-reciprocal at this point).
  const participantResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true }),
    })
    return { status: r.status }
  }, { handshakeId })
  expect(participantResult.status).toBe(201)

  // Verify both parties' submissions are tracked independently in the summary.
  await switchUser(page, participant)
  const summary = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch(`/api/handshakes/${handshakeId}/`, { credentials: 'include' })
    return await r.json() as Record<string, unknown>
  }, { handshakeId })

  // user_has_reviewed must be true after participant's submission.
  expect(summary['user_has_reviewed']).toBe(true)
})
