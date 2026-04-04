import { test, expect } from '@playwright/test'

import { createNeed, loginAs, openServiceFromDashboard, uniqueTitle, USERS } from '../helpers'

test('FR-06a: registered user can create a request with core details and location type', async ({ page }) => {
  const title = uniqueTitle('FR-06a Need')

  // Open the request form and confirm the core fields are present.
  await loginAs(page, USERS.cem)
  await page.goto('/post-need')

  await expect(page.locator('input[name="title"]')).toBeVisible()
  await expect(page.locator('textarea[name="description"]')).toBeVisible()
  await expect(page.locator('input[name="duration"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'In-Person' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Online' })).toBeVisible()

  // Submit a basic online request with the minimum core details.
  await createNeed(page, {
    title,
    description: 'Feature 6 FR-06a checks title, description, duration and location type creation.',
    duration: 1,
    online: true,
  })

  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Online').first()).toBeVisible()

  // Re-open the listing from the dashboard to confirm it is discoverable after creation.
  await openServiceFromDashboard(page, title)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
})
