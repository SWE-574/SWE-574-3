import { expect, type Page } from '@playwright/test'

import { type DemoUser, loginAs } from './auth'
import { futureDateParts, uniqueTitle } from './common'
import { createNeed } from './feature6'
import { createOffer, requestOfferFromDetail } from './feature5'
import { findHandshakeId } from './feature7'
import { switchUser } from './session'

export interface E2EHandshake {
  id: string
  status: string
  service_title: string
  requester_name: string
  provider_initiated?: boolean
  requester_initiated?: boolean
  provisioned_hours?: number | string
  exact_duration?: number | null
  scheduled_time?: string | null
  exact_location?: string | null
  cancellation_requested_by_id?: string | null
  cancellation_reason?: string | null
}

export async function listHandshakes(page: Page): Promise<E2EHandshake[]> {
  const handshakes = await page.evaluate(async () => {
    const response = await fetch('/api/handshakes/', {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`Could not list handshakes: ${response.status}`)
    }

    return await response.json()
  })

  return Array.isArray(handshakes) ? handshakes : []
}

export async function fetchHandshake(page: Page, handshakeId: string): Promise<E2EHandshake> {
  const handshake = await page.evaluate(async ({ handshakeId }) => {
    const response = await fetch(`/api/handshakes/${handshakeId}/`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`Could not read handshake: ${response.status}`)
    }

    return await response.json()
  }, { handshakeId })

  const typed = handshake as E2EHandshake
  return {
    ...typed,
    provisioned_hours: typed.provisioned_hours == null ? typed.provisioned_hours : Number(typed.provisioned_hours),
  }
}

export async function createPendingOfferExchange(page: Page, options: {
  owner: DemoUser
  requester: DemoUser
  title?: string
  duration?: number
}): Promise<{
  title: string
  detailUrl: string
  serviceId: string
}> {
  const title = options.title ?? uniqueTitle('Feature 8 Offer')

  await loginAs(page, options.owner)
  const { detailUrl } = await createOffer(page, {
    title,
    description: `Playwright creates ${title} for Feature 8 verification.`,
    duration: options.duration ?? 1,
    online: true,
  })

  const match = detailUrl.match(/\/service-detail\/([^/?#]+)/)
  if (!match) {
    throw new Error(`Could not extract service id from URL: ${detailUrl}`)
  }

  await switchUser(page, options.requester)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  return {
    title,
    detailUrl,
    serviceId: match[1],
  }
}

export async function createPendingNeedExchange(page: Page, options: {
  owner: DemoUser
  responder: DemoUser
  title?: string
  duration?: number
}): Promise<{
  title: string
  detailUrl: string
}> {
  const title = options.title ?? uniqueTitle('Feature 8 Need')

  await loginAs(page, options.owner)
  const { detailUrl } = await createNeed(page, {
    title,
    description: `Playwright creates ${title} for Feature 8 verification.`,
    duration: options.duration ?? 1,
    online: true,
  })

  await switchUser(page, options.responder)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  return {
    title,
    detailUrl,
  }
}

export async function initiateOnlineHandshakeViaApi(page: Page, options: {
  serviceTitle: string
  requesterName: string
  duration?: number
  meetingLink?: string
  daysAhead?: number
}): Promise<string> {
  const handshakeId = await findHandshakeId(page, {
    serviceTitle: options.serviceTitle,
    requesterName: options.requesterName,
    status: 'pending',
  })

  let result: { ok: boolean; status: number; body: string } | null = null
  const minutes = ['00', '15', '30', '45']
  const seed = Date.now()

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { date } = futureDateParts((options.daysAhead ?? 3) + Math.floor(attempt / 4))
    const slotHour = 9 + ((seed + attempt) % 8)
    const slotMinute = minutes[(Math.floor(seed / 1000) + attempt) % minutes.length] ?? '00'
    const time = `${String(slotHour).padStart(2, '0')}:${slotMinute}`

    result = await page.evaluate(async ({ handshakeId, duration, meetingLink, date, time }) => {
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
      meetingLink: options.meetingLink ?? 'https://meet.example.com/feature-8',
      date,
      time,
    })

    if (result.ok || !result.body.toLowerCase().includes('schedule conflict')) {
      break
    }
  }

  expect(result?.ok, `Initiate handshake failed: ${result?.status} ${result?.body}`).toBeTruthy()
  return handshakeId
}

export async function postHandshakeAction(
  page: Page,
  handshakeId: string,
  actionPath: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; body: string }> {
  return await page.evaluate(async ({ handshakeId, actionPath, body }) => {
    const response = await fetch(`/api/handshakes/${handshakeId}/${actionPath}/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
  }, { handshakeId, actionPath, body })
}
