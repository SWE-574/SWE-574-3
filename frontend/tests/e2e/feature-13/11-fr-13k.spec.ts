import { test, expect } from '@playwright/test'

import { createServiceViaApi, futureDateParts, loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-13k: in-person pre-accepted detail views show only approximate location and hide the precise address', async ({ page }) => {
  const title = uniqueTitle('FR-13k Group Offer')
  const { date, time } = futureDateParts(3)

  // Create a fixed in-person group offer so the backend has an exact session address that must remain hidden pre-acceptance.
  await loginAs(page, USERS.elif)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 FR-13k checks privacy blur behavior before acceptance.',
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

  await page.context().clearCookies()
  await page.goto(created.detailUrl)

  // Public viewers should only see the approximate area, not the private exact address.
  await expect(page.getByText(/Approximate Location/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Kadikoy/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Exact address is hidden/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Moda Sahili No: 12, Kadikoy')).toHaveCount(0)
})
