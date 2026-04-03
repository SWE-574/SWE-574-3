import { test, expect } from '@playwright/test'
import {
  loginAs,
  switchUser,
  uniqueTitle,
  USERS,
  createEventViaApi,
  joinEventViaApi,
  markAttendedViaApi,
  completeEventViaApi,
} from '../helpers'

test('NFR-15b: attendance status transitions are atomic — concurrent mark-attended calls do not corrupt state', async ({ page, context }) => {
  const title = uniqueTitle('NFR-15b Event')
  const organizer = USERS.ayse
  const p1 = USERS.mehmet
  const p2 = USERS.zeynep

  const event = await createEventViaApi(page, organizer, { title, maxParticipants: 5 })

  // Both participants join.
  await switchUser(page, p1)
  const h1 = await joinEventViaApi(page, event.id)

  await switchUser(page, p2)
  const h2 = await joinEventViaApi(page, event.id)

  // Force both into checked_in.
  await page.evaluate(async ({ h1, h2 }) => {
    await Promise.all([
      fetch(`/api/handshakes/${h1}/checkin/`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } }),
      fetch(`/api/handshakes/${h2}/checkin/`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } }),
    ])
  }, { h1, h2 })

  // Organizer marks both attended concurrently — neither call should corrupt the other.
  await switchUser(page, organizer)
  const [r1, r2] = await page.evaluate(async ({ h1, h2 }) => {
    const [a, b] = await Promise.all([
      fetch(`/api/handshakes/${h1}/mark-attended/`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } }),
      fetch(`/api/handshakes/${h2}/mark-attended/`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } }),
    ])
    return [a.status, b.status]
  }, { h1, h2 })

  // Both transitions must succeed.
  expect(r1).toBe(200)
  expect(r2).toBe(200)

  // After completion the event transitions cleanly to Completed state.
  await completeEventViaApi(page, event.id)
  await page.goto(event.detailUrl)
  await expect(page.getByText(/Completed/i).first()).toBeVisible({ timeout: 10_000 })
})
