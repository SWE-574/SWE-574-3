import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupCompletedExchange,
  submitEvaluationViaApi,
} from '../helpers'

test("FR-14c: negative trait selections are not publicly displayed on the evaluated user's profile", async ({ page }) => {
  const title = uniqueTitle('FR-14c Offer')
  const provider = USERS.zeynep
  const requester = USERS.can
  const thirdParty = USERS.deniz

  // Reach completed state; page ends logged in as provider.
  const { handshakeId, serviceDetailUrl } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  // Requester submits negative-only evaluation about the provider via API.
  await switchUser(page, requester)
  await submitEvaluationViaApi(page, {
    handshakeId,
    is_late: true,
    is_unhelpful: true,
    is_rude: true,
  })

  // Third-party viewer navigates to provider's public profile via the service detail page.
  await switchUser(page, thirdParty)
  await page.goto(serviceDetailUrl)
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 15_000 })

  // The provider card on service detail has a "View Profile →" button — click it.
  await page.getByText('View Profile →').first().click()
  await expect(page).toHaveURL(/public-profile/i, { timeout: 15_000 })

  // Negative trait names must NOT appear in the reputation section.
  const repSection = page.locator('main')
  await expect(repSection.getByText(/\bLate\b/)).not.toBeVisible()
  await expect(repSection.getByText(/\bUnhelpful\b/)).not.toBeVisible()
  await expect(repSection.getByText(/\bRude\b/)).not.toBeVisible()
})
