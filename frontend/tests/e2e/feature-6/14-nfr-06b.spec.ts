import { test, expect } from '@playwright/test'

import { createNeed, loginAs, uniqueTitle, USERS } from '../helpers'

test('NFR-06b: only authenticated users can create, edit, or cancel requests', async ({ page }) => {
  // Anonymous users should be bounced to login before reaching the request form.
  await page.goto('/post-need')
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

  // Create a request as an authenticated user to obtain protected edit/detail URLs.
  await loginAs(page, USERS.mehmet)
  const { detailUrl } = await createNeed(page, {
    title: uniqueTitle('NFR-06b Need'),
    description: 'Feature 6 NFR-06b validates auth protection for request mutation actions.',
  })
  const editUrl = detailUrl.replace('/service-detail/', '/edit-service/')

  // After logout, direct edit access should also redirect to login.
  await page.context().clearCookies()
  await page.goto(editUrl)
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

  // Anonymous users should not see owner-only mutation actions on the detail page.
  await page.context().clearCookies()
  await page.goto(detailUrl)
  await expect(page.getByRole('button', { name: 'Remove Listing' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit Listing' })).toHaveCount(0)
})
