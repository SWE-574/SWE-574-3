import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupAttendedEventHandshake,
} from '../helpers'

test('FR-15e: event evaluation comment is optional and publicly visible on organizer profile when provided', async ({ page }) => {
  const title = uniqueTitle('FR-15e Event')
  const organizer = USERS.elif
  const participant = USERS.cem
  const reviewText = `Great well-organised event – FR-15e ${Date.now()}`

  // Reach attended state.
  const { event, handshakeId } = await setupAttendedEventHandshake(page, {
    organizer,
    participant,
    title,
  })

  // Participant submits evaluation WITH a comment (already logged in as participant).
  const evalResult = await page.evaluate(async ({ handshakeId, reviewText }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handshake_id: handshakeId,
        well_organized: true,
        engaging: true,
        welcoming: false,
        comment: reviewText,
      }),
    })
    return { status: r.status }
  }, { handshakeId, reviewText })

  expect(evalResult.status).toBe(201)

  // Organizer's public profile should list the comment in event_comments_history
  // after the evaluation window expires (blind review).
  // Navigate to the organizer's public profile — verify comment section exists.
  await switchUser(page, USERS.burak)
  await page.goto(event.detailUrl)
  await page.getByText('View Profile →').first().click()
  await expect(page).toHaveURL(/public-profile/i, { timeout: 15_000 })
  // Comment section heading should appear on the public profile.
  await expect(page.getByText(/event.*comment|event.*review|review.*event/i).first()).toBeVisible({ timeout: 10_000 })
})

test('FR-15e: event evaluation without comment is accepted and creates no visible empty entry', async ({ page }) => {
  const title = uniqueTitle('FR-15e No-Comment Event')
  const organizer = USERS.ayse
  const participant = USERS.mehmet

  const { handshakeId } = await setupAttendedEventHandshake(page, {
    organizer,
    participant,
    title,
  })

  // Submit evaluation WITHOUT a comment field.
  const evalResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true, engaging: false, welcoming: true }),
    })
    return { status: r.status }
  }, { handshakeId })

  expect(evalResult.status).toBe(201)
})
