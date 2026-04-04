import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupCompletedExchange,
  submitEvaluationViaApi,
} from '../helpers'

test("FR-14c: negative trait selections are not publicly displayed on service detail and public profile", async ({ page }) => {
  const title = uniqueTitle('FR-14c Offer')
  const provider = USERS.zeynep
  const requester = USERS.ayse
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

  // Service detail public view must not expose negative trait labels.
  const serviceMain = page.locator('main')
  await expect(serviceMain.getByText(/\bLate\b/)).not.toBeVisible()
  await expect(serviceMain.getByText(/\bUnhelpful\b/)).not.toBeVisible()
  await expect(serviceMain.getByText(/\bRude\b/)).not.toBeVisible()

  // The provider card on service detail has a "View Profile →" button — click it.
  await page.getByText('View Profile →').first().click()
  await expect(page).toHaveURL(/public-profile/i, { timeout: 15_000 })

  // Public profile should render normally while still hiding negative traits.
  await expect(page.getByText(/^Reviews$/).first()).toBeVisible({ timeout: 15_000 })

  // Negative trait names must NOT appear on the public profile.
  const repSection = page.locator('main')
  await expect(repSection.getByText(/\bLate\b/)).not.toBeVisible()
  await expect(repSection.getByText(/\bUnhelpful\b/)).not.toBeVisible()
  await expect(repSection.getByText(/\bRude\b/)).not.toBeVisible()
})
