import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupAttendedEventHandshake,
} from '../helpers'

// FR-16e: both tests use event evaluations — events require no TimeBank balance,
// and event evaluations update both karma_score (synchronously in the view)
// and organizer_event_hot_score (via EventEvaluationService.refresh_summary).

test('FR-16e: submitting an event evaluation updates the organizer karma_score', async ({ page }) => {
  const title = uniqueTitle('FR-16e Karma')
  const organizer = USERS.deniz
  const participant = USERS.burak

  // Reach attended + completed state; session ends as participant.
  const { handshakeId } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // Capture organizer karma before evaluation.
  await switchUser(page, organizer)
  const karmaBefore = await page.evaluate(async () => {
    const r = await fetch('/api/users/me/', { credentials: 'include' })
    const data = await r.json() as Record<string, unknown>
    return (data['karma_score'] as number) ?? 0
  })

  // Participant submits a positive evaluation — karma incremented synchronously.
  await switchUser(page, participant)
  const evalResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handshake_id: handshakeId,
        well_organized: true,
        engaging: true,
        welcoming: true,
      }),
    })
    return { status: r.status }
  }, { handshakeId })
  expect(evalResult.status).toBe(201)

  // karma_score is updated immediately (target_user.karma_score += karma_gain; save()).
  await switchUser(page, organizer)
  const karmaAfter = await page.evaluate(async () => {
    const r = await fetch('/api/users/me/', { credentials: 'include' })
    const data = await r.json() as Record<string, unknown>
    return (data['karma_score'] as number) ?? 0
  })
  expect(karmaAfter).toBeGreaterThan(karmaBefore)
})

test('FR-16e: event evaluation updates organizer_event_hot_score in event summary', async ({ page }) => {
  const title = uniqueTitle('FR-16e Event Score')
  const organizer = USERS.yasemin
  const participant = USERS.ayse

  // Reach attended + completed state; session ends as participant.
  const { event, handshakeId } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // Before evaluation the event_evaluation_summary may not exist yet → score is 0.
  // organizer_event_hot_score lives at:
  //   GET /api/services/{id}/ → response.event_evaluation_summary.organizer_event_hot_score
  const scoreBefore = await page.evaluate(async ({ serviceId }) => {
    const r = await fetch(`/api/services/${serviceId}/`, { credentials: 'include' })
    const data = await r.json() as Record<string, unknown>
    const summary = data['event_evaluation_summary'] as Record<string, unknown> | null
    return summary ? ((summary['organizer_event_hot_score'] as number) ?? 0) : 0
  }, { serviceId: event.id })

  // Participant submits positive evaluation — view calls EventEvaluationService.refresh_summary()
  // synchronously, updating both event_evaluation_summary and user.event_hot_score.
  const evalResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handshake_id: handshakeId,
        well_organized: true,
        engaging: true,
        welcoming: true,
      }),
    })
    return { status: r.status }
  }, { handshakeId })
  expect(evalResult.status).toBe(201)

  // Fresh service detail fetch must show updated organizer_event_hot_score.
  const scoreAfter = await page.evaluate(async ({ serviceId }) => {
    const r = await fetch(`/api/services/${serviceId}/`, { credentials: 'include' })
    const data = await r.json() as Record<string, unknown>
    const summary = data['event_evaluation_summary'] as Record<string, unknown> | null
    return summary ? ((summary['organizer_event_hot_score'] as number) ?? 0) : 0
  }, { serviceId: event.id })

  expect(scoreAfter).toBeGreaterThan(scoreBefore)
})
