import { test, expect } from '@playwright/test'

import {
  createServiceViaApi,
  loginAs,
  pickUsersWithBalanceAtLeast,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('FR-13c: authenticated non-owners see Express Interest on active offer pages while capacity is available', async ({ page }) => {
  const title = uniqueTitle('FR-13c Offer')
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 1, 1, [owner.email])

  // Create an active offer with spare capacity.
  await loginAs(page, owner)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 FR-13c checks offer-side action visibility for non-owners.',
    duration: 1,
    locationType: 'Online',
  })

  // A different authenticated user should see the interest action immediately on the detail page.
  await switchUser(page, requester)
  await page.goto(created.detailUrl)
  await expect(page.getByRole('button', { name: 'Request this Service' })).toBeVisible({ timeout: 10_000 })
})
