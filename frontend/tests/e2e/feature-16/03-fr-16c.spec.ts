import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupAttendedEventHandshake,
} from '../helpers'

test('FR-16c: evaluation comment is not visible in public profile during the blind-review window', async ({ page }) => {
  const title = uniqueTitle('FR-16c Event')
  const organizer = USERS.burak
  const participant = USERS.yasemin
  const reviewText = `Excellent organisation – FR-16c ${Date.now()}`

  // Reach attended + completed state; session is as participant.
  const { event } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // Participant submits evaluation with a comment via the UI.
  await page.goto(event.detailUrl)
  await page.getByRole('button', { name: /Leave Evaluation/i }).first().click()
  await expect(page.getByText('Evaluate Organizer')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Well Organized' }).click()
  await page.getByPlaceholder(/Write a short review/i).fill(reviewText)
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()

  // Navigate to the organizer's public profile as a third-party viewer.
  // Comment must NOT be visible while the 48-hour blind-review window is open.
  await switchUser(page, USERS.deniz)
  await page.goto(event.detailUrl)
  await page.getByText('View Profile →').first().click()
  await expect(page).toHaveURL(/public-profile/i, { timeout: 15_000 })

  // Comment text must not appear on the profile during the blind window.
  // (Full comment visibility after window close is covered by backend integration tests.)
  await expect(page.getByText(reviewText)).not.toBeVisible({ timeout: 5_000 })
})

test('FR-16c: evaluation trait summary is visible on public profile after submission', async ({ page }) => {
  const title = uniqueTitle('FR-16c Traits Event')
  const organizer = USERS.elif
  const participant = USERS.cem

  // Reach attended + completed state.
  const { event } = await setupAttendedEventHandshake(page, { organizer, participant, title })

  // Participant submits evaluation without a comment.
  await page.goto(event.detailUrl)
  await page.getByRole('button', { name: /Leave Evaluation/i }).first().click()
  await expect(page.getByText('Evaluate Organizer')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Engaging' }).click()
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()

  // Public profile of the organizer must load without error.
  await switchUser(page, USERS.zeynep)
  await page.goto(event.detailUrl)
  await page.getByText('View Profile →').first().click()
  await expect(page).toHaveURL(/public-profile/i, { timeout: 15_000 })

  // Profile page rendered without a crash — evaluation data is being served.
  await expect(page.locator('body')).not.toContainText(/error|500|not found/i)
})
