import { test, expect } from '@playwright/test'

import {
  createServiceViaApi,
  fetchServiceDetailPayload,
  futureDateParts,
  loginAs,
  pickUsersWithBalanceAtLeast,
  requestOfferFromDetail,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('NFR-13c: precise location data is not transmitted to clients whose status is below accepted', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 1, 1, [owner.email])
  const title = uniqueTitle('NFR-13c Group Offer')
  const { date, time } = futureDateParts(3)

  // Create a fixed in-person group offer that has a private exact address on the owner side.
  await loginAs(page, owner)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 NFR-13c verifies that private location payloads stay hidden below accepted state.',
    duration: 2,
    locationType: 'In-Person',
    locationArea: 'Kadikoy',
    locationLat: 29.0312,
    locationLng: 40.9909,
    maxParticipants: 2,
    scheduleType: 'One-Time',
    scheduledTime: `${date}T${time}:00`,
    sessionExactLocation: 'Moda Sahili No: 12, Kadikoy',
    sessionExactLocationLat: 29.0331,
    sessionExactLocationLng: 40.9875,
  })

  const ownerPayload = await fetchServiceDetailPayload<{
    session_exact_location?: string | null
    session_exact_location_lat?: number | string | null
    session_exact_location_lng?: number | string | null
  }>(page, created.id)

  expect(ownerPayload.session_exact_location).toBe('Moda Sahili No: 12, Kadikoy')

  // The requester can create only a pending handshake and still must not receive the exact location fields.
  await switchUser(page, requester)
  await page.goto(created.detailUrl)
  await requestOfferFromDetail(page)

  const requesterPayload = await fetchServiceDetailPayload<{
    session_exact_location?: string | null
    session_exact_location_lat?: number | string | null
    session_exact_location_lng?: number | string | null
  }>(page, created.id)

  expect(requesterPayload.session_exact_location ?? null).toBeNull()
  expect(requesterPayload.session_exact_location_lat ?? null).toBeNull()
  expect(requesterPayload.session_exact_location_lng ?? null).toBeNull()
})
