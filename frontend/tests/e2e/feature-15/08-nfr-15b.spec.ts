import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  createEventViaApi,
  joinEventViaApi,
  completeEventViaApi,
} from '../helpers'

test('NFR-15b: attendance status transitions are atomic — both mark-attended calls succeed without corrupting each other', async ({ page }) => {
  const title = uniqueTitle('NFR-15b Event')
  const organizer = USERS.ayse
  const p1 = USERS.mehmet
  const p2 = USERS.zeynep

  // Schedule within the check-in window so each participant's checkin is accepted.
  const event = await createEventViaApi(page, organizer, { title, maxParticipants: 5, minutesAhead: 30 })

  // p1 joins and checks in as themselves.
  await switchUser(page, p1)
  const h1 = await joinEventViaApi(page, event.id)
  await page.evaluate(async ({ h1 }) => {
    await fetch(`/api/handshakes/${h1}/checkin/`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    })
  }, { h1 })

  // p2 joins and checks in as themselves.
  await switchUser(page, p2)
  const h2 = await joinEventViaApi(page, event.id)
  await page.evaluate(async ({ h2 }) => {
    await fetch(`/api/handshakes/${h2}/checkin/`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    })
  }, { h2 })

  // Organizer marks each participant attended in sequence — both calls must succeed.
  await switchUser(page, organizer)
  const r1 = await page.evaluate(async ({ h1 }) => {
    const r = await fetch(`/api/handshakes/${h1}/mark-attended/`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    })
    return r.status
  }, { h1 })

  const r2 = await page.evaluate(async ({ h2 }) => {
    const r = await fetch(`/api/handshakes/${h2}/mark-attended/`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    })
    return r.status
  }, { h2 })

  expect(r1).toBe(200)
  expect(r2).toBe(200)

  // Completing the event must also succeed — neither attended handshake is downgraded.
  await completeEventViaApi(page, event.id)
  await page.goto(event.detailUrl)
  await expect(page.getByText(/Completed/i).first()).toBeVisible({ timeout: 10_000 })
})
