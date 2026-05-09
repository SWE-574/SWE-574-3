import { expect, type Page } from '@playwright/test'

import { type DemoUser, USERS } from './auth'
import { uniqueTitle } from './common'
import { createServiceViaApi } from './feature13'
import { switchUser } from './session'

/**
 * Feature 11 (Events) — shared helpers for the requirement-mapped E2E suite.
 *
 * Mirrors the shape of feature5/feature6/feature7 helpers: small, focused
 * functions that compose into per-FR specs. Each test case owns its own
 * unique titles via `uniqueTitle()` so the suite is collision-free under
 * `fullyParallel: true`.
 */

export interface EventCreateOptions {
  title?: string
  description?: string
  durationHours?: number
  maxParticipants?: number
  scheduledAt?: Date
  location?: 'online' | 'in_person'
}

export interface CreatedEvent {
  id: string
  title: string
  detailUrl: string
}

/**
 * Create a published Event service via the REST API. Assumes the caller is
 * already authenticated.
 *
 * The historical UI flow (dashboard → "Create Event" button → form fill) no
 * longer exists in this shape — events are posted at /post-event with
 * separate date/time pickers and a custom Label component, and there is no
 * dashboard-level "Create Event" button. Going through the documented public
 * API matches what the feature-13/15 helpers do and keeps the suite focused
 * on event lifecycle behaviour rather than form-shape regressions, which are
 * covered separately by the post-event UI specs.
 */
export async function createEvent(
  page: Page,
  options: EventCreateOptions = {},
): Promise<CreatedEvent> {
  const title = options.title ?? uniqueTitle('Feature 11 Event')
  const description = options.description ?? `Playwright created ${title} for feature-11.`
  const scheduled = options.scheduledAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
  const max = options.maxParticipants ?? 6
  const scheduledTime = scheduled.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:MM"

  const created = await createServiceViaApi(page, {
    type: 'Event',
    title,
    description,
    duration: options.durationHours ?? 1,
    locationType: options.location === 'in_person' ? 'In-Person' : 'Online',
    locationArea: options.location === 'in_person' ? 'Kadikoy' : 'Online',
    maxParticipants: max,
    scheduleType: 'One-Time',
    scheduledTime,
  })

  // Land on the detail page so callers that chain .getByText(title) keep
  // their previous semantics without a separate page.goto().
  await page.goto(created.detailUrl)
  await expect(page.getByText(created.title).first()).toBeVisible({ timeout: 15_000 })

  return { id: created.id, title: created.title, detailUrl: created.detailUrl }
}

/**
 * Express interest in an event from the current user via the API endpoint,
 * returning the resulting handshake id. Faster than going through the UI
 * for setup. Events use the dedicated /join-event/ endpoint which lands the
 * handshake in `accepted` state (no provider approval step), so callers see
 * the participant on the organizer's roster immediately.
 */
export async function expressInterestViaApi(page: Page, eventId: string): Promise<string> {
  const result = await page.evaluate(async ({ eventId }) => {
    const response = await fetch(`/api/handshakes/services/${eventId}/join-event/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    return { ok: response.ok, status: response.status, body: await response.text() }
  }, { eventId })

  if (!result.ok) {
    throw new Error(`POST join-event failed: ${result.status} ${result.body}`)
  }
  const body = JSON.parse(result.body) as { id?: string; handshake_id?: string }
  return (body.handshake_id ?? body.id) as string
}

/**
 * Mark the requester as attended (organizer-only action).
 */
export async function markAttendedViaApi(page: Page, handshakeId: string): Promise<void> {
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
 * Cancel an event (organizer-only). Hits the dedicated cancel-event action
 * because PATCH /api/services/{id}/ with status=Cancelled is rejected for
 * Events; the organizer ban-window check lives only on cancel-event.
 */
export async function cancelEventViaApi(
  page: Page,
  eventId: string,
  options: { reason?: string } = {},
): Promise<void> {
  const reason = options.reason ?? 'Cancelled by E2E feature-11 helper.'
  const result = await page.evaluate(async ({ eventId, reason }) => {
    const response = await fetch(`/api/services/${eventId}/cancel-event/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    return { ok: response.ok, status: response.status, body: await response.text() }
  }, { eventId, reason })

  expect(result.ok, `cancel-event failed: ${result.status} ${result.body}`).toBeTruthy()
}

/**
 * Quick role-switch helper: log in as the second user, perform `action`,
 * then return to the first user.
 */
export async function asUser<T>(
  page: Page,
  user: DemoUser,
  action: () => Promise<T>,
): Promise<T> {
  await switchUser(page, user)
  return action()
}

export const FEATURE_11_USERS = {
  organizer: USERS.elif,
  attendeeA: USERS.cem,
  attendeeB: USERS.ayse,
}
