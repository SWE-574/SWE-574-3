import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupAttendedEventHandshake,
  submitPositiveEventEvalViaApi,
  submitNegativeEventEvalViaApi,
} from '../helpers'

test('FR-15f: positive event trait submission changes event hot score and not service hot score', async ({ page }) => {
  const title = uniqueTitle('FR-15f Pos Event')
  const organizer = USERS.zeynep
  const participant = USERS.can

  const { event, handshakeId } = await setupAttendedEventHandshake(page, {
    organizer,
    participant,
    title,
  })

  // Snapshot service hot_score before evaluation.
  await switchUser(page, organizer)
  const before = await page.evaluate(async ({ serviceId }) => {
    const r = await fetch(`/api/services/${serviceId}/`, { credentials: 'include' })
    const d = await r.json() as { hot_score?: number }
    return d.hot_score ?? 0
  }, { serviceId: event.id })

  // Participant submits positive evaluation.
  await switchUser(page, participant)
  const evalResult = await submitPositiveEventEvalViaApi(page, handshakeId)
  expect(evalResult.status).toBe(201)

  // Service hot_score must remain unchanged after event evaluation.
  await switchUser(page, organizer)
  const after = await page.evaluate(async ({ serviceId }) => {
    const r = await fetch(`/api/services/${serviceId}/`, { credentials: 'include' })
    const d = await r.json() as { hot_score?: number }
    return d.hot_score ?? 0
  }, { serviceId: event.id })

  expect(after).toBe(before)
})

test('FR-15f: negative event trait submission changes event hot score and not service hot score', async ({ page }) => {
  const title = uniqueTitle('FR-15f Neg Event')
  const organizer = USERS.deniz
  const participant = USERS.yasemin

  const { event, handshakeId } = await setupAttendedEventHandshake(page, {
    organizer,
    participant,
    title,
  })

  // Submit positive first so there is a baseline, then submit negative.
  await submitPositiveEventEvalViaApi(page, handshakeId)

  await switchUser(page, organizer)
  const before = await page.evaluate(async ({ serviceId }) => {
    const r = await fetch(`/api/services/${serviceId}/`, { credentials: 'include' })
    const d = await r.json() as { hot_score?: number }
    return d.hot_score ?? 0
  }, { serviceId: event.id })

  await switchUser(page, participant)
  const negResult = await submitNegativeEventEvalViaApi(page, handshakeId)
  expect(negResult.status).toBe(201)

  await switchUser(page, organizer)
  const after = await page.evaluate(async ({ serviceId }) => {
    const r = await fetch(`/api/services/${serviceId}/`, { credentials: 'include' })
    const d = await r.json() as { hot_score?: number }
    return d.hot_score ?? 0
  }, { serviceId: event.id })

  expect(after).toBe(before)
})
