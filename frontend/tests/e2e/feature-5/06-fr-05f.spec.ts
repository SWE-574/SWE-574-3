import { test, expect } from '@playwright/test'
import { createOffer, loginAs, requestOfferFromDetail, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-05f: affected applicants receive an in-app notification with changed fields after offer edit', async ({ page }) => {
  const title = uniqueTitle('FR-05f Offer')
  const updatedTitle = `${title} Updated`
  const updatedDescription = 'Feature 5 FR-05f updated description to trigger applicant notification.'

  // Create the original offer as the owner.
  await loginAs(page, USERS.elif)
  const { detailUrl } = await createOffer(page, {
    title,
    description: 'Feature 5 FR-05f initial description for notification check.',
  })

  // Another user leaves interest so they become an affected applicant.
  await switchUser(page, USERS.mehmet)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  // Owner edits fields that should appear in the applicant notification payload.
  await switchUser(page, USERS.elif)
  await page.goto(detailUrl)
  await page.getByRole('button', { name: 'Edit Listing' }).click()
  await page.locator('input[name="title"]').fill(updatedTitle)
  await page.locator('textarea[name="description"]').fill(updatedDescription)
  await page.getByRole('button', { name: 'Save Changes' }).click()

  // Save navigates back to /service-detail/<id>; wait for that landing instead
  // of racing the success toast that may unmount on navigation.
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible({ timeout: 15_000 })

  // Applicant should see an in-app notification mentioning the updated fields.
  await switchUser(page, USERS.mehmet)
  await page.goto('/notifications')
  await expect(page.getByText('Service updated').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(updatedTitle).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Changed fields: title, description/i).first()).toBeVisible({ timeout: 10_000 })
})
