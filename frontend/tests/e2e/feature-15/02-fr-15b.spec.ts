import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  createEventViaApi,
  joinEventViaApi,
} from '../helpers'

test('FR-15b: users with JOINED status are blocked from submitting event evaluations', async ({ page }) => {
  const title = uniqueTitle('FR-15b Event')
  const organizer = USERS.mehmet
  const participant = USERS.burak

  // Participant joins but is never marked attended — status stays accepted/joined.
  const event = await createEventViaApi(page, organizer, { title })

  await switchUser(page, participant)
  const handshakeId = await joinEventViaApi(page, event.id)

  // API call with status still in accepted (joined) state must be rejected.
  const evalResult = await page.evaluate(async ({ handshakeId }) => {
    const r = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handshake_id: handshakeId, well_organized: true, engaging: false, welcoming: false }),
    })
    return { status: r.status }
  }, { handshakeId })

  expect(evalResult.status).toBe(404)

  // UI must not show the Leave Evaluation button for a joined-only participant.
  await page.goto(event.detailUrl)
  await expect(page.getByRole('button', { name: /Leave Evaluation/i })).not.toBeVisible({ timeout: 8_000 })

  // Joined participants see their registration state instead.
  await expect(page.getByText(/You're registered|Check-in opens/i).first()).toBeVisible({ timeout: 8_000 })
})
