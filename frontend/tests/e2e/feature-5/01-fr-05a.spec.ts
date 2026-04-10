import { test, expect } from '@playwright/test'
import { createOffer, loginAs, openServiceFromDashboard, uniqueTitle, USERS } from '../helpers'

test('FR-05a: registered user can create an offer with core details and location type', async ({ page }) => {
  const title = uniqueTitle('FR-05a Offer')

  // Log in (lands on /dashboard), then navigate to offer form.
  await loginAs(page, USERS.cem)

  // Now navigate to the offer form — auth cookies are set.
  await page.goto('/post-offer')
  await expect(page).toHaveURL(/\/post-offer/, { timeout: 10_000 })

  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('textarea[name="description"]')).toBeVisible()
  await expect(page.locator('input[name="duration"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'In-Person' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Online' })).toBeVisible()

  // Submit a basic online offer with the minimum core details.
  await createOffer(page, {
    title,
    description: 'Feature 5 FR-05a checks title, description, duration and location type creation.',
    duration: 2,
    online: true,
  })

  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Online').first()).toBeVisible()

  // Re-open the listing from the dashboard to confirm it is discoverable after creation.
  await openServiceFromDashboard(page, title)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
})
