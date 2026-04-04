import { expect, type Page } from '@playwright/test'

import { type DemoUser, loginAs } from './auth'
import { uniqueTitle } from './common'
import { createServiceViaApi } from './feature13'
import { switchUser } from './session'

export interface Feature16Exchange {
  serviceId: string
  handshakeId: string
  detailUrl: string
  title: string
}

/**
 * Creates a completed online Offer exchange between provider and requester.
 * Flow: create offer → express interest → accept → initiate → approve → confirm × 2
 * Returns the serviceId and handshakeId in COMPLETED status.
 */
export async function setupCompletedServiceHandshake(
  page: Page,
  provider: DemoUser,
  requester: DemoUser,
  overrides: { title?: string; duration?: number } = {},
): Promise<Feature16Exchange> {
  const title = overrides.title ?? uniqueTitle('FR-16 Offer')
  const duration = overrides.duration ?? 1

  // Provider creates an online offer.
  await loginAs(page, provider)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 16 E2E evaluation window test.',
    duration,
    locationType: 'Online',
    locationArea: 'Online',
    scheduleType: 'One-Time',
  })
  const serviceId = created.id
  const detailUrl = created.detailUrl

  // Requester expresses interest → PENDING handshake.
  await switchUser(page, requester)
  const interestResult = await page.evaluate(async ({ serviceId }) => {
    const r = await fetch(`/api/services/${serviceId}/interest/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    const body = await r.json() as { id?: string }
    return { ok: r.ok, status: r.status, id: body.id ?? null, error: JSON.stringify(body) }
  }, { serviceId })
  expect(interestResult.ok, `express-interest failed: ${interestResult.status} ${interestResult.error}`).toBeTruthy()
  const handshakeId = interestResult.id as string

  // Provider initiates handshake with online details (1 day ahead to avoid conflicts).
  // Flow for Offer: pending → provider initiates → requester approves → accepted.
  await switchUser(page, provider)
  const future = new Date(Date.now() + 24 * 60 * 60 * 1_000)
  const scheduledTime = future.toISOString().slice(0, 16)
  const initiateResult = await page.evaluate(async ({ handshakeId, scheduledTime, duration }) => {
    const r = await fetch(`/api/handshakes/${handshakeId}/initiate/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exact_location: 'https://meet.example.com/fr16',
        exact_duration: duration,
        scheduled_time: `${scheduledTime}:00`,
      }),
    })
    return { ok: r.ok, status: r.status, body: await r.text() }
  }, { handshakeId, scheduledTime, duration })
  expect(initiateResult.ok, `initiate failed: ${initiateResult.status} ${initiateResult.body}`).toBeTruthy()

  // Requester approves the handshake details → ACCEPTED.
  await switchUser(page, requester)
  const approveResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch(`/api/handshakes/${handshakeId}/approve/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    return { ok: r.ok, status: r.status, body: await r.text() }
  }, { handshakeId })
  expect(approveResult.ok, `approve failed: ${approveResult.status} ${approveResult.body}`).toBeTruthy()

  // Requester confirms completion (first confirmation).
  const confirm1 = await page.evaluate(async ({ handshakeId, duration }) => {
    const r = await fetch(`/api/handshakes/${handshakeId}/confirm/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: duration }),
    })
    return { ok: r.ok, status: r.status, body: await r.text() }
  }, { handshakeId, duration })
  expect(confirm1.ok, `requester confirm failed: ${confirm1.status} ${confirm1.body}`).toBeTruthy()

  // Provider confirms completion (second confirmation → COMPLETED).
  await switchUser(page, provider)
  const confirm2 = await page.evaluate(async ({ handshakeId, duration }) => {
    const r = await fetch(`/api/handshakes/${handshakeId}/confirm/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: duration }),
    })
    return { ok: r.ok, status: r.status, body: await r.text() }
  }, { handshakeId, duration })
  expect(confirm2.ok, `provider confirm failed: ${confirm2.status} ${confirm2.body}`).toBeTruthy()

  // Leave session as requester (evaluation is submitted by requester).
  await switchUser(page, requester)

  return { serviceId, handshakeId, detailUrl, title }
}

/**
 * Submits a positive service evaluation via API as the current user.
 */
export async function submitPositiveServiceEvalViaApi(
  page: Page,
  handshakeId: string,
  opts: { punctual?: boolean; helpful?: boolean; kindness?: boolean; comment?: string } = {},
): Promise<{ ok: boolean; status: number }> {
  return await page.evaluate(async ({ handshakeId, opts }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handshake_id: handshakeId,
        punctual: opts.punctual ?? true,
        helpful: opts.helpful ?? true,
        kindness: opts.kindness ?? false,
        ...(opts.comment ? { comment: opts.comment } : {}),
      }),
    })
    return { ok: r.ok, status: r.status }
  }, { handshakeId, opts })
}

/**
 * Fetches the current user's public profile and returns the raw response body.
 */
export async function fetchOwnProfile(page: Page): Promise<Record<string, unknown>> {
  return await page.evaluate(async () => {
    const r = await fetch('/api/users/me/', { credentials: 'include' })
    return await r.json() as Record<string, unknown>
  })
}
