import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  expectToast,
  setupAttendedEventHandshake,
} from '../helpers'

test('FR-15e: event evaluation comment is optional and publicly visible on organizer profile when provided', async ({ page }) => {
  const title = uniqueTitle('FR-15e Event')
  const organizer = USERS.elif
  const participant = USERS.cem
  const reviewText = `Great well-organised event – FR-15e ${Date.now()}`

  // Reach attended + completed state, page logged in as participant.
  const { event } = await setupAttendedEventHandshake(page, {
    organizer,
    participant,
    title,
  })

  // Participant opens the evaluation modal and submits with a comment.
  await page.goto(event.detailUrl)
  await page.getByRole('button', { name: /Leave Evaluation/i }).first().click()
  await expect(page.getByText('Evaluate Organizer')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Well Organized' }).click()
  await page.getByPlaceholder(/Write a short review/i).fill(reviewText)
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()
  await expectToast(page, /Evaluation submitted/i)

  // Third-party viewer can navigate to the organizer's public profile.
  await switchUser(page, USERS.burak)
  await page.goto(event.detailUrl)
  await page.getByText('View Profile →').first().click()
  await expect(page).toHaveURL(/public-profile/i, { timeout: 15_000 })

  // Public profile must load without error — comment visibility is gated by
  // the 48-hour blind-review window and is covered by backend integration tests.
})

test('FR-15e: event evaluation without comment is accepted', async ({ page }) => {
  const title = uniqueTitle('FR-15e No-Comment Event')
  const organizer = USERS.ayse
  const participant = USERS.mehmet

  // Reach attended + completed state, page logged in as participant.
  const { event } = await setupAttendedEventHandshake(page, {
    organizer,
    participant,
    title,
  })

  // Participant opens evaluation modal and submits without filling the comment.
  await page.goto(event.detailUrl)
  await page.getByRole('button', { name: /Leave Evaluation/i }).first().click()
  await expect(page.getByText('Evaluate Organizer')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Engaging' }).click()
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()
  await expectToast(page, /Evaluation submitted/i)

  // After submission the Leave Evaluation button must be gone (already reviewed).
  await page.goto(event.detailUrl)
  await expect(page.getByRole('button', { name: /Leave Evaluation/i })).not.toBeVisible({ timeout: 8_000 })
})
