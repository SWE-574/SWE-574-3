import { expect, type Page } from '@playwright/test'

import { expectToast } from './auth'
import { futureDateParts } from './common'
import { openConversationForService, openDashboardSearch, openServiceFromDashboard } from './navigation'

const ONE_PIXEL_PNG_BYTES = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
  8, 4, 0, 0, 0, 181, 28, 12,
  2, 0, 0, 0, 11, 73, 68, 65,
  84, 120, 218, 99, 252, 255, 31, 0,
  2, 235, 1, 245, 105, 251, 202, 215,
  0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
])

export async function createOffer(page: Page, options: {
  title: string
  description?: string
  duration?: number
  online?: boolean
  maxParticipants?: number
  meetingLink?: string
  uploadFixture?: boolean
}): Promise<{ detailUrl: string }> {
  const {
    title,
    description = 'Playwright creates this offer for Feature 5 verification.',
    duration = 1,
    online = true,
    maxParticipants,
    meetingLink = 'https://meet.example.com/feature-5',
    uploadFixture = false,
  } = options

  await page.goto('/post-offer')

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill(description)
  await page.locator('input[name="duration"]').fill(String(duration))

  if (typeof maxParticipants === 'number') {
    await page.locator('input[name="max_participants"]').fill(String(maxParticipants))
  }

  if (online) {
    await page.getByRole('button', { name: 'Online' }).click()
  }

  if (online && typeof maxParticipants === 'number' && maxParticipants > 1) {
    await page
      .getByPlaceholder(/Zoom link|Google Meet|Discord server/i)
      .fill(meetingLink)

    const { date, time } = futureDateParts(2)
    await page.locator('input[type="date"]').fill(date)
    await page.locator('input[type="time"]').fill(time)
  }

  if (uploadFixture) {
    await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({
      name: 'offer-photo.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG_BYTES,
    })
  }

  await page.getByRole('button', { name: 'Post Offer' }).click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })

  return { detailUrl: page.url() }
}

export async function requestOfferFromDetail(page: Page): Promise<void> {
  const requestBtn = page.getByRole('button', { name: /Request this Service|Offer to Help/i })
  await expect(requestBtn).toBeVisible({ timeout: 15_000 })
  await requestBtn.click()

  const requestToast = page.locator('[data-sonner-toaster] li').filter({
    hasText: /Interest expressed|already|insufficient/i,
  }).first()
  const openChatBtn = page.getByRole('button', { name: /Open Chat|View Chat/i }).first()
  try {
    await expect(requestToast).toBeVisible({ timeout: 3_000 })
  } catch {
    await expect(openChatBtn).toBeVisible({ timeout: 10_000 })
  }
}

export async function initiateOnlineSessionAsOwner(page: Page, options: {
  serviceTitle: string
  requesterName: string
  duration?: number
  meetingLink?: string
  daysAhead?: number
}): Promise<void> {
  const { date, time } = futureDateParts(options.daysAhead ?? 3)
  const result = await page.evaluate(async ({ serviceTitle, requesterName, duration, meetingLink, date, time }) => {
    const listRes = await fetch('/api/handshakes/', { credentials: 'include' })
    const handshakes = await listRes.json()
    const target = (Array.isArray(handshakes) ? handshakes : []).find((handshake: Record<string, unknown>) => {
      return handshake.service_title === serviceTitle
        && handshake.status === 'pending'
        && handshake.requester_name === requesterName
    })

    if (!target) {
      return { ok: false, status: 404, body: 'Pending handshake not found for initiate' }
    }

    const initiateRes = await fetch(`/api/handshakes/${target.id}/initiate/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        exact_location: meetingLink,
        exact_duration: duration,
        scheduled_time: `${date}T${time}:00`,
      }),
    })

    return {
      ok: initiateRes.ok,
      status: initiateRes.status,
      body: await initiateRes.text(),
    }
  }, {
    serviceTitle: options.serviceTitle,
    requesterName: options.requesterName,
    duration: options.duration ?? 1,
    meetingLink: options.meetingLink ?? 'https://meet.example.com/feature-edit-lock',
    date,
    time,
  })

  expect(result.ok, `Initiate handshake failed: ${result.status} ${result.body}`).toBeTruthy()
}

export async function approveSessionAsRequester(page: Page): Promise<void> {
  const reviewBtn = page.getByRole('button', { name: 'Review & Approve' })
  await expect(reviewBtn).toBeVisible({ timeout: 15_000 })
  await reviewBtn.click()

  await expect(page.getByText('Session Details').first()).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Approve & Confirm' }).click()

  const approvedToast = page.locator('[data-sonner-toaster] li').filter({
    hasText: /Session approved! Handshake is now accepted.|accepted/i,
  }).first()
  const openChatBtn = page.getByRole('button', { name: /Open Chat|View Chat/i }).first()
  const acceptedStatus = page.getByText(/Accepted/i).first()

  await expect(approvedToast.or(openChatBtn).or(acceptedStatus)).toBeVisible({ timeout: 15_000 })
}

export async function approvePendingHandshakeViaApi(page: Page, options: {
  serviceTitle: string
  requesterName: string
}): Promise<void> {
  const result = await page.evaluate(async ({ serviceTitle, requesterName }) => {
    const listRes = await fetch('/api/handshakes/', { credentials: 'include' })
    const handshakes = await listRes.json()
    const target = (Array.isArray(handshakes) ? handshakes : []).find((handshake: Record<string, unknown>) => {
      return handshake.service_title === serviceTitle
        && handshake.status === 'pending'
        && handshake.requester_name === requesterName
    })

    if (!target) {
      return { ok: false, status: 404, body: 'Pending handshake not found for approve' }
    }

    const approveRes = await fetch(`/api/handshakes/${target.id}/approve/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    return {
      ok: approveRes.ok,
      status: approveRes.status,
      body: await approveRes.text(),
    }
  }, options)

  expect(result.ok, `Approve handshake failed: ${result.status} ${result.body}`).toBeTruthy()
}

export async function shareFixedGroupDetailsAsOwner(page: Page, serviceTitle: string): Promise<void> {
  await openConversationForService(page, serviceTitle)

  const initiateBtn = page.getByRole('button', { name: /Initiate Handshake|Share Offer Details/i })
  await expect(initiateBtn).toBeVisible({ timeout: 15_000 })
  await initiateBtn.click()

  await expect(page.getByText(/Use Group Offer Details|Initiate Handshake/i).first()).toBeVisible({ timeout: 10_000 })

  const shareBtn = page.getByRole('button', { name: /Share Fixed Details|Send Details/i })
  await expect(shareBtn).toBeVisible({ timeout: 10_000 })
  await shareBtn.click()

  await expectToast(page, /Session details sent|fixed details/i)
}

export async function requestAndApproveFixedGroupOffer(page: Page, serviceTitle: string): Promise<void> {
  await openServiceFromDashboard(page, serviceTitle)
  await requestOfferFromDetail(page)
}

export function extractServiceId(detailUrl: string): string {
  const match = detailUrl.match(/\/service-detail\/([^/?#]+)/)
  if (!match) {
    throw new Error(`Could not extract service id from URL: ${detailUrl}`)
  }
  return match[1]
}

export async function acceptPendingHandshakeViaApi(page: Page, options: {
  serviceId: string
  requesterName: string
}): Promise<void> {
  const result = await page.evaluate(async ({ serviceId, requesterName }) => {
    const listRes = await fetch('/api/handshakes/', { credentials: 'include' })
    const handshakes = await listRes.json()
    const target = (Array.isArray(handshakes) ? handshakes : []).find((handshake: Record<string, unknown>) => {
      const service = handshake.service
      const handshakeServiceId =
        typeof service === 'string'
          ? service
          : (service && typeof service === 'object' && 'id' in service ? String((service as { id: string }).id) : null)

      return handshakeServiceId === serviceId
        && handshake.status === 'pending'
        && handshake.requester_name === requesterName
    })

    if (!target) {
      return { ok: false, status: 404, body: 'Pending handshake not found' }
    }

    const acceptRes = await fetch(`/api/handshakes/${target.id}/accept/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    return {
      ok: acceptRes.ok,
      status: acceptRes.status,
      body: await acceptRes.text(),
    }
  }, options)

  expect(result.ok, `Accept handshake failed: ${result.status} ${result.body}`).toBeTruthy()
}

export { openConversationForService, openDashboardSearch, openServiceFromDashboard }
