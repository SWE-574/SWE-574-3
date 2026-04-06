import { test, expect } from '@playwright/test'

import {
  createServiceViaApi,
  pickUsersWithBalanceAtLeast,
  switchUser,
  uniqueTitle,
} from '../helpers'

test('FR-13d: authenticated non-owners see Respond on request pages when they have not initiated an exchange yet', async ({ page }) => {
  const title = uniqueTitle('FR-13d Need')
  const picked = await pickUsersWithBalanceAtLeast(page, 1, 2)
  const owner = picked[0]?.user
  const responder = picked[1]?.user

  if (!owner || !responder) {
    throw new Error('Could not pick two authenticated users for FR-13d.')
  }

  // Create a request with enough balance on the owner side.
  await switchUser(page, owner)
  const created = await createServiceViaApi(page, {
    type: 'Need',
    title,
    description: 'Feature 13 FR-13d checks request-side response visibility for non-owners.',
    duration: 1,
    locationType: 'Online',
  })

  // Another authenticated user should see the request response action.
  await switchUser(page, responder)
  await page.goto(created.detailUrl)
  await expect(page.getByRole('button', { name: 'Offer to Help' })).toBeVisible({ timeout: 10_000 })
})
