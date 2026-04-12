import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  createEventViaApi,
  joinEventViaApi,
} from '../helpers'

test('NFR-15c: event evaluation UI explains why ineligible users are blocked from submitting', async ({ page }) => {
  const title = uniqueTitle('NFR-15c Event')
  const organizer = USERS.burak
  const participant = USERS.yasemin

  // Participant joins a future event but is never marked attended — evaluation is ineligible.
  const event = await createEventViaApi(page, organizer, { title })

  await switchUser(page, participant)
  await joinEventViaApi(page, event.id)

  // Navigate to the event detail page as the ineligible (joined-only) participant.
  await page.goto(event.detailUrl)

  // Leave Evaluation must not be shown for a joined participant.
  await expect(page.getByRole('button', { name: /Leave Evaluation/i })).not.toBeVisible({ timeout: 8_000 })

  // The UI must explain why — either via check-in guidance or a registration status message.
  await expect(
    page.getByText(/Check-in opens|You're registered|must be attended|not eligible/i).first(),
  ).toBeVisible({ timeout: 8_000 })
})
