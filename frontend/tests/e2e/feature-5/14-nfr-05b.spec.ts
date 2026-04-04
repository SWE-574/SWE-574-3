import { test, expect } from '@playwright/test'
import { createOffer, loginAs, uniqueTitle, USERS } from '../helpers'

test('NFR-05b: only authenticated users can create, edit, or cancel offers', async ({ page }) => {
  // Anonymous users should be bounced to login before reaching the create form.
  await page.goto('/post-offer')
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

  // Create an offer as an authenticated user to obtain protected edit/detail URLs.
  await loginAs(page, USERS.mehmet)
  const { detailUrl } = await createOffer(page, {
    title: uniqueTitle('NFR-05b Offer'),
    description: 'Feature 5 NFR-05b validates auth protection for offer mutation actions.',
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
