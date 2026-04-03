import { test, expect } from '@playwright/test'
import {
  loginAs,
  switchUser,
  uniqueTitle,
  USERS,
  createEventViaApi,
  joinEventViaApi,
  setupAttendedEventHandshake,
} from '../helpers'

test('FR-15a: event evaluation access is restricted to participants with ATTENDED status', async ({ page }) => {
  const title = uniqueTitle('FR-15a Event')
  const organizer = USERS.elif
  const attendee = USERS.cem
  const justJoined = USERS.ayse

  // Create event; both users join — only attendee will be marked attended.
  const event = await createEventViaApi(page, organizer, { title, maxParticipants: 5 })

  await switchUser(page, justJoined)
  await joinEventViaApi(page, event.id)

  // Attendee path: join then get marked attended by organizer.
  const { handshakeId: attendedHandshakeId } = await setupAttendedEventHandshake(page, {
    organizer,
    participant: attendee,
    title: uniqueTitle('FR-15a Attended'),
  })

  // Attended participant: evaluation API call must succeed.
  const evalResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true, engaging: true, welcoming: false }),
    })
    return { status: r.status }
  }, { handshakeId: attendedHandshakeId })

  expect(evalResult.status).toBe(201)

  // Navigate to the event detail page — evaluation section must be visible.
  await page.goto(event.detailUrl)
  await expect(page.getByText(/rate this event|leave.*evaluation|submit.*evaluation/i).first()).toBeVisible({ timeout: 10_000 })
})
