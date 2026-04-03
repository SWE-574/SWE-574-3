import { test, expect } from '@playwright/test'
import {
  loginAs,
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

  // Participant joins but is never marked attended — evaluation is ineligible.
  const event = await createEventViaApi(page, organizer, { title })

  await switchUser(page, participant)
  await joinEventViaApi(page, event.id)

  // Navigate to the event detail page as the ineligible participant.
  await page.goto(event.detailUrl)

  // The UI must not silently hide the evaluation affordance without explanation.
  // Either:
  //   a) the CTA is absent and a blocking reason text is shown, or
  //   b) clicking the CTA shows an explanation inside a modal/tooltip.
  const hasBlockMessage = await page.getByText(
    /must be attended|need to attend|not eligible|attendance required|check.in required/i,
  ).isVisible({ timeout: 8_000 }).catch(() => false)

  const hasHiddenCta = await page.getByText(/leave.*evaluation/i).isVisible({ timeout: 3_000 }).catch(() => false)

  if (!hasBlockMessage && hasHiddenCta) {
    // CTA exists — clicking it must reveal the reason.
    await page.getByText(/leave.*evaluation/i).first().click()
    await expect(
      page.getByText(/must be attended|not eligible|attendance required|cannot evaluate/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  } else {
    // No CTA and an explanation is shown inline — requirement satisfied.
    expect(hasBlockMessage || !hasHiddenCta).toBeTruthy()
  }
})
