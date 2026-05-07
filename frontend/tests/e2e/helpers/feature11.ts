import { expect, type Page } from '@playwright/test'

import { type DemoUser, USERS } from './auth'
import { uniqueTitle } from './common'
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
 * Create a published Event service via the UI. Assumes the caller is
 * already authenticated.
 */
export async function createEvent(
  page: Page,
  options: EventCreateOptions = {},
): Promise<CreatedEvent> {
  const title = options.title ?? uniqueTitle('Feature 11 Event')
  const description = options.description ?? `Playwright created ${title} for feature-11.`
  const scheduled = options.scheduledAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
  const max = options.maxParticipants ?? 6

  await page.goto('/dashboard')
  await page.getByRole('button', { name: /create.*event/i }).first().click()
  await page.getByLabel(/title/i).fill(title)
  await page.getByLabel(/description/i).fill(description)
  await page.getByLabel(/duration/i).fill(String(options.durationHours ?? 1))
  await page.getByLabel(/max participants|capacity/i).fill(String(max))
  await page.getByLabel(/scheduled|when/i).fill(scheduled.toISOString().slice(0, 16))
  if (options.location === 'in_person') {
    await page.getByLabel(/in[-\s]?person/i).check()
  } else {
    await page.getByLabel(/online/i).check()
  }
  await page.getByRole('button', { name: /publish|create/i }).click()

  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 })
  const detailUrl = page.url()
  const id = detailUrl.match(/services?\/([0-9a-f-]{36})/)?.[1] ?? ''
  return { id, title, detailUrl }
}

/**
 * Express interest from the current user via the API endpoint, returning
 * the resulting handshake id. Faster than going through the UI for setup.
 */
export async function expressInterestViaApi(page: Page, eventId: string): Promise<string> {
  const result = await page.evaluate(async ({ eventId }) => {
    const response = await fetch(`/api/services/${eventId}/interest/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      throw new Error(`POST interest failed: ${response.status}`)
    }
    const body = await response.json()
    return body.handshake_id ?? body.id
  }, { eventId })
  return result as string
}

/**
 * Mark the requester as attended (organizer-only action).
 */
export async function markAttendedViaApi(page: Page, handshakeId: string): Promise<void> {
  await page.evaluate(async ({ handshakeId }) => {
    const response = await fetch(`/api/handshakes/${handshakeId}/mark_attended/`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error(`mark_attended failed: ${response.status}`)
    }
  }, { handshakeId })
}

/**
 * Cancel an event (organizer-only).
 */
export async function cancelEventViaApi(page: Page, eventId: string): Promise<void> {
  await page.evaluate(async ({ eventId }) => {
    const response = await fetch(`/api/services/${eventId}/`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    if (!response.ok) {
      throw new Error(`cancel failed: ${response.status}`)
    }
  }, { eventId })
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
