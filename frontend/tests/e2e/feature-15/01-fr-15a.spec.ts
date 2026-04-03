import { test, expect } from '@playwright/test'
import {
  uniqueTitle,
  USERS,
  setupAttendedEventHandshake,
} from '../helpers'

test('FR-15a: event evaluation access is restricted to participants with ATTENDED status', async ({ page }) => {
  const title = uniqueTitle('FR-15a Event')
  const organizer = USERS.elif
  const attendee = USERS.cem

  // Reach attended + completed state so the Leave Evaluation button is shown.
  const { event } = await setupAttendedEventHandshake(page, {
    organizer,
    participant: attendee,
    title,
  })

  // Page is now logged in as attendee. Navigate to event detail.
  await page.goto(event.detailUrl)

  // Attended participant should see "Attendance confirmed!" and the Leave Evaluation button.
  await expect(page.getByText(/Attendance confirmed/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /Leave Evaluation/i }).first()).toBeVisible({ timeout: 10_000 })

  // Clicking it opens the Evaluate Organizer modal with event-specific traits.
  await page.getByRole('button', { name: /Leave Evaluation/i }).first().click()
  await expect(page.getByText('Evaluate Organizer')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Well Organized' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Engaging' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Welcoming', exact: true })).toBeVisible()
})
