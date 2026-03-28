import { test, expect } from '@playwright/test'

import { createNeed, loginAs, openDashboardSearch, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-06j: active requests remain discoverable in the public feed', async ({ page }) => {
  const title = uniqueTitle('FR-06j Need')

  // Create an active request as the owner.
  await loginAs(page, USERS.yasemin)
  await createNeed(page, {
    title,
    description: 'Feature 6 FR-06j validates public discovery for active requests.',
  })

  // Another user should be able to find that request from dashboard search.
  await switchUser(page, USERS.burak)
  await openDashboardSearch(page, title)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
})
