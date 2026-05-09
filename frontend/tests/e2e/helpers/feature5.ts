import { expect, type Page } from '@playwright/test'

import { type DemoUser, expectToast } from './auth'
import { futureDateParts } from './common'
import { openConversationForService, openDashboardSearch, openServiceFromDashboard } from './navigation'
import { switchUser } from './session'

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
  const minutes = ['00', '15', '30', '45']
  const seed = Date.now()
  let result: { ok: boolean; status: number; body: string } | null = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { date } = futureDateParts((options.daysAhead ?? 3) + Math.floor(attempt / 4))
    const slotHour = 9 + ((seed + attempt) % 8)
    const slotMinute = minutes[(Math.floor(seed / 1000) + attempt) % minutes.length] ?? '00'
    const time = `${String(slotHour).padStart(2, '0')}:${slotMinute}`

    result = await page.evaluate(async ({ serviceTitle, requesterName, duration, meetingLink, date, time }) => {
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

    if (result.ok || !result.body.toLowerCase().includes('schedule conflict')) {
      break
    }
  }

  expect(result?.ok, `Initiate handshake failed: ${result?.status} ${result?.body}`).toBeTruthy()
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

async function findPendingHandshakeIdForService(page: Page, options: {
  serviceId: string
  requesterName: string
}): Promise<string | null> {
  return await page.evaluate(async ({ serviceId, requesterName }) => {
    const listRes = await fetch('/api/handshakes/', { credentials: 'include' })
    if (!listRes.ok) {
      return null
    }
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

    return typeof target?.id === 'string' ? target.id : null
  }, options)
}

/**
 * Drive a pending Offer/Need handshake to ``accepted`` state.
 *
 * The backend rejects a direct ``accept`` call on Offer/Need services with
 * ``INVALID_STATE: "Set session details first via Initiate"``: the provider
 * must first ``initiate`` session details and the requester must then
 * ``approve`` them.  This helper performs that handshake from the test, so
 * call sites that previously POSTed ``accept`` keep working.
 *
 * The page must already be authenticated as the owner.  When ``owner`` and
 * ``requester`` are passed the helper switches to the requester to call
 * ``approve`` and then switches back to the owner.  For Event services pass
 * neither and the helper falls through to a single ``accept`` call.
 */
export async function acceptPendingHandshakeViaApi(page: Page, options: {
  serviceId: string
  requesterName: string
  owner?: DemoUser
  requester?: DemoUser
  duration?: number
  meetingLink?: string
}): Promise<void> {
  const handshakeId = await findPendingHandshakeIdForService(page, {
    serviceId: options.serviceId,
    requesterName: options.requesterName,
  })

  if (!handshakeId) {
    expect(handshakeId, `Pending handshake not found for service ${options.serviceId} / ${options.requesterName}`).toBeTruthy()
    return
  }

  if (options.owner && options.requester) {
    // Offer/Need flow: provider initiates session details, requester approves.
    const minutes = ['00', '15', '30', '45']
    const seed = Date.now()
    let initiateResult: { ok: boolean; status: number; body: string } | null = null

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { date } = futureDateParts(3 + Math.floor(attempt / 4))
      const slotHour = 9 + ((seed + attempt) % 8)
      const slotMinute = minutes[(Math.floor(seed / 1000) + attempt) % minutes.length] ?? '00'
      const time = `${String(slotHour).padStart(2, '0')}:${slotMinute}`

      initiateResult = await page.evaluate(async ({ handshakeId, duration, meetingLink, date, time }) => {
        const response = await fetch(`/api/handshakes/${handshakeId}/initiate/`, {
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
          ok: response.ok,
          status: response.status,
          body: await response.text(),
        }
      }, {
        handshakeId,
        duration: options.duration ?? 1,
        meetingLink: options.meetingLink ?? 'https://meet.example.com/feature-accept',
        date,
        time,
      })

      if (initiateResult.ok || !initiateResult.body.toLowerCase().includes('schedule conflict')) {
        break
      }
    }

    expect(initiateResult?.ok, `Initiate handshake failed: ${initiateResult?.status} ${initiateResult?.body}`).toBeTruthy()

    await switchUser(page, options.requester)

    const approveResult = await page.evaluate(async ({ handshakeId }) => {
      const response = await fetch(`/api/handshakes/${handshakeId}/approve/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      }
    }, { handshakeId })

    expect(approveResult.ok, `Approve handshake failed: ${approveResult.status} ${approveResult.body}`).toBeTruthy()

    await switchUser(page, options.owner)
    return
  }

  // Event services support direct accept by the provider.
  const result = await page.evaluate(async ({ handshakeId }) => {
    const acceptRes = await fetch(`/api/handshakes/${handshakeId}/accept/`, {
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
  }, { handshakeId })

  expect(result.ok, `Accept handshake failed: ${result.status} ${result.body}`).toBeTruthy()
}

export { openConversationForService, openDashboardSearch, openServiceFromDashboard }
