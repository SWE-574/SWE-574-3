import { expect, type Page } from '@playwright/test'

import { type DemoUser, loginAs } from './auth'
import { uniqueTitle } from './common'
import { createServiceViaApi } from './feature13'
import { switchUser } from './session'

export interface Feature15Event {
  id: string
  title: string
  detailUrl: string
}

/**
 * Creates a future one-time Event as the given organizer and returns its id and detail URL.
 */
export async function createEventViaApi(
  page: Page,
  organizer: DemoUser,
  overrides: { title?: string; maxParticipants?: number; minutesAhead?: number } = {},
): Promise<Feature15Event> {
  const title = overrides.title ?? uniqueTitle('FR-15 Event')
  // Default: 3 days out (check-in window closed — suitable for joined/no-show tests).
  // Pass minutesAhead ≤ 1440 to place the event inside the 24-hour check-in window.
  const msAhead = (overrides.minutesAhead ?? 3 * 24 * 60) * 60 * 1_000
  const future = new Date(Date.now() + msAhead)
  const scheduledTime = future.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:MM"

  await loginAs(page, organizer)
  const created = await createServiceViaApi(page, {
    type: 'Event',
    title,
    description: 'Feature 15 E2E test event.',
    duration: 2,
    locationType: 'Online',
    locationArea: 'Online',
    maxParticipants: overrides.maxParticipants ?? 10,
    scheduleType: 'One-Time',
    scheduledTime,
  })

  return { id: created.id, title: created.title, detailUrl: created.detailUrl }
}

/**
 * Joins an event as the current logged-in user and returns the handshake id.
 */
export async function joinEventViaApi(page: Page, eventId: string): Promise<string> {
  const result = await page.evaluate(async ({ eventId }) => {
    const response = await fetch(`/api/handshakes/services/${eventId}/join-event/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    return { ok: response.ok, status: response.status, body: await response.text() }
  }, { eventId })

  expect(result.ok, `join-event failed: ${result.status} ${result.body}`).toBeTruthy()
  const parsed = JSON.parse(result.body) as { id: string }
  return parsed.id
}

/**
 * Forces a handshake into the given status directly via the API test utility.
 * Uses mark-attended (checked_in → attended) or complete-event (service-level).
 */
export async function markAttendedViaApi(
  page: Page,
  handshakeId: string,
): Promise<void> {
  const result = await page.evaluate(async ({ handshakeId }) => {
    const response = await fetch(`/api/handshakes/${handshakeId}/mark-attended/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    return { ok: response.ok, status: response.status, body: await response.text() }
  }, { handshakeId })

  expect(result.ok, `mark-attended failed: ${result.status} ${result.body}`).toBeTruthy()
}

/**
 * Triggers check-in for the current user on the given handshake.
 */
export async function checkinViaApi(page: Page, handshakeId: string): Promise<void> {
  const result = await page.evaluate(async ({ handshakeId }) => {
    const response = await fetch(`/api/handshakes/${handshakeId}/checkin/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    return { ok: response.ok, status: response.status, body: await response.text() }
  }, { handshakeId })

  // 400 is acceptable here if the check-in window is not yet open; tests that need
  // the checked_in state should use the admin override path instead.
  void result
}

/**
 * Submits a positive event evaluation via API as the current user.
 */
export async function submitPositiveEventEvalViaApi(
  page: Page,
  handshakeId: string,
  opts: { well_organized?: boolean; engaging?: boolean; welcoming?: boolean; comment?: string } = {},
): Promise<{ ok: boolean; status: number }> {
  return await page.evaluate(async ({ handshakeId, opts }) => {
    const response = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handshake_id: handshakeId,
        well_organized: opts.well_organized ?? true,
        engaging: opts.engaging ?? true,
        welcoming: opts.welcoming ?? false,
        ...(opts.comment ? { comment: opts.comment } : {}),
      }),
    })
    return { ok: response.ok, status: response.status }
  }, { handshakeId, opts })
}

/**
 * Submits a negative event evaluation via API as the current user.
 */
export async function submitNegativeEventEvalViaApi(
  page: Page,
  handshakeId: string,
  opts: { disorganized?: boolean; boring?: boolean; unwelcoming?: boolean } = {},
): Promise<{ ok: boolean; status: number }> {
  return await page.evaluate(async ({ handshakeId, opts }) => {
    const response = await fetch('/api/reputation/negative/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handshake_id: handshakeId,
        disorganized: opts.disorganized ?? true,
        boring: opts.boring ?? false,
        unwelcoming: opts.unwelcoming ?? false,
      }),
    })
    return { ok: response.ok, status: response.status }
  }, { handshakeId, opts })
}

/**
 * Calls complete-event on the service as the current logged-in organizer.
 */
export async function completeEventViaApi(page: Page, serviceId: string): Promise<void> {
  const result = await page.evaluate(async ({ serviceId }) => {
    const response = await fetch(`/api/services/${serviceId}/complete-event/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    return { ok: response.ok, status: response.status, body: await response.text() }
  }, { serviceId })

  expect(result.ok, `complete-event failed: ${result.status} ${result.body}`).toBeTruthy()
}

/**
 * Convenience: create event, join as participant, mark organizer as attended.
 * Returns the event and the participant's handshake id already in attended state.
 */
export async function setupAttendedEventHandshake(
  page: Page,
  options: {
    organizer: DemoUser
    participant: DemoUser
    title?: string
  },
): Promise<{ event: Feature15Event; handshakeId: string }> {
  // Schedule 30 minutes ahead so the 24-hour check-in window is already open,
  // which allows checkin → mark-attended to succeed.
  const event = await createEventViaApi(page, options.organizer, { title: options.title, minutesAhead: 30 })

  await switchUser(page, options.participant)
  const handshakeId = await joinEventViaApi(page, event.id)

  // Organizer session needed for mark-attended, but first set checked_in as participant.
  await switchUser(page, options.organizer)

  // Force into checked_in as participant, then organizer marks attended.
  await switchUser(page, options.participant)
  await checkinViaApi(page, handshakeId)

  await switchUser(page, options.organizer)
  await markAttendedViaApi(page, handshakeId)

  // Complete the event so event_completed_at is set and the evaluation window opens.
  // Attended handshakes are not downgraded during completion.
  await completeEventViaApi(page, event.id)

  // Leave page session as participant, ready for evaluation assertions.
  await switchUser(page, options.participant)

  return { event, handshakeId }
}
