import { test, expect } from '@playwright/test'

import { createNeed, loginAs, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-06l: request edits remain owner-only authorized', async ({ page }) => {
  const title = uniqueTitle('FR-06l Need')

  // Create the request as its owner and confirm the edit page is reachable for them.
  await loginAs(page, USERS.yasemin)
  const { detailUrl } = await createNeed(page, {
    title,
    description: 'Feature 6 FR-06l validates owner-only request edit authorization.',
  })

  await page.goto(detailUrl)
  await page.getByRole('button', { name: 'Edit Listing' }).click()
  await expect(page).toHaveURL(/\/edit-service\//, { timeout: 15_000 })

  const editUrl = detailUrl.replace('/service-detail/', '/edit-service/')

  // A different authenticated user should be redirected away from the edit page.
  await switchUser(page, USERS.burak)
  await page.goto(editUrl)
  await expect(page).not.toHaveURL(/\/edit-service\//, { timeout: 15_000 })
  await expect(page).toHaveURL(new RegExp(detailUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 15_000 })
})
