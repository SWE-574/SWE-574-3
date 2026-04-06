import { test, expect } from '@playwright/test'

import { createNeed, expectToast, loginAs, requestOfferFromDetail, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-06f: affected responders receive an in-app notification after request edit', async ({ page }) => {
  const title = uniqueTitle('FR-06f Need')
  const updatedTitle = `${title} Updated`
  const updatedDescription = 'Feature 6 FR-06f updated description to trigger responder notification.'

  // Create the original request as the owner.
  await loginAs(page, USERS.elif)
  const { detailUrl } = await createNeed(page, {
    title,
    description: 'Feature 6 FR-06f initial description for notification check.',
  })

  // Another user offers help so they become an affected responder.
  await switchUser(page, USERS.mehmet)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  // Owner edits fields that should appear in the responder notification payload.
  await switchUser(page, USERS.elif)
  await page.goto(detailUrl)
  await page.getByRole('button', { name: 'Edit Listing' }).click()
  await page.locator('input[name="title"]').fill(updatedTitle)
  await page.locator('textarea[name="description"]').fill(updatedDescription)
  await page.getByRole('button', { name: 'Save Changes' }).click()

  await expectToast(page, /updated successfully/i)

  // The responder should see a service-updated notification with the changed field summary.
  await switchUser(page, USERS.mehmet)
  await page.goto('/notifications')
  await expect(page.getByText('Service updated').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(updatedTitle).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Changed fields: title, description/i).first()).toBeVisible({ timeout: 10_000 })
})
