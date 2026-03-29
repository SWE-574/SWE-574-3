import { expect, type Page } from '@playwright/test'

export interface Feature13ServiceOptions {
  type: 'Offer' | 'Need' | 'Event'
  title: string
  description?: string
  duration?: number
  locationType?: 'Online' | 'In-Person'
  locationArea?: string
  locationLat?: number
  locationLng?: number
  maxParticipants?: number
  scheduleType?: 'One-Time' | 'Recurrent'
  scheduleDetails?: string
  scheduledTime?: string
  tagNames?: string[]
  sessionExactLocation?: string
  sessionExactLocationLat?: number
  sessionExactLocationLng?: number
  sessionLocationGuide?: string
}

export interface Feature13CreatedService {
  id: string
  title: string
  detailUrl: string
}

export async function createServiceViaApi(
  page: Page,
  options: Feature13ServiceOptions,
): Promise<Feature13CreatedService> {
  const result = await page.evaluate(async (payload) => {
    const formData = new FormData()
    formData.append('type', payload.type)
    formData.append('title', payload.title)
    formData.append('description', payload.description ?? 'Feature 13 API-created listing.')
    formData.append('duration', String(payload.duration ?? 1))
    formData.append('location_type', payload.locationType ?? 'Online')
    formData.append('location_area', payload.locationArea ?? (payload.locationType === 'In-Person' ? 'Kadikoy' : 'Online'))
    formData.append('max_participants', String(payload.maxParticipants ?? 1))
    formData.append('schedule_type', payload.scheduleType ?? 'One-Time')

    if (payload.scheduleDetails) {
      formData.append('schedule_details', payload.scheduleDetails)
    }

    if (payload.scheduledTime) {
      formData.append('scheduled_time', payload.scheduledTime)
    }

    if (payload.locationType === 'In-Person') {
      formData.append('location_lat', String(payload.locationLat ?? 29.026))
      formData.append('location_lng', String(payload.locationLng ?? 41.043))
    }

    for (const tagName of payload.tagNames ?? []) {
      formData.append('tag_names', tagName)
    }

    if (payload.sessionExactLocation != null) {
      formData.append('session_exact_location', payload.sessionExactLocation)
    }

    if (payload.sessionExactLocationLat != null) {
      formData.append('session_exact_location_lat', String(payload.sessionExactLocationLat))
    }

    if (payload.sessionExactLocationLng != null) {
      formData.append('session_exact_location_lng', String(payload.sessionExactLocationLng))
    }

    if (payload.sessionLocationGuide != null) {
      formData.append('session_location_guide', payload.sessionLocationGuide)
    }

    const response = await fetch('/api/services/', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })

    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
  }, options)

  expect(result.ok, `Create service failed: ${result.status} ${result.body}`).toBeTruthy()

  const created = JSON.parse(result.body) as { id: string; title: string }
  return {
    id: created.id,
    title: created.title,
    detailUrl: `/service-detail/${created.id}`,
  }
}

export async function fetchServiceDetailPayload<T extends Record<string, unknown>>(
  page: Page,
  serviceId: string,
): Promise<T> {
  return await page.evaluate(async ({ serviceId }) => {
    const response = await fetch(`/api/services/${serviceId}/`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`Could not read service detail payload: ${response.status}`)
    }

    return await response.json()
  }, { serviceId }) as T
}

export async function openChatFromServiceDetail(page: Page): Promise<void> {
  const chatButton = page.getByRole('button', { name: /Open Chat|View Chat \(Pending\)|View Chat/i }).first()
  await expect(chatButton).toBeVisible({ timeout: 15_000 })
  await chatButton.click()
  await expect(page).toHaveURL(/\/messages/, { timeout: 15_000 })
}
