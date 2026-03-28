import { test, expect } from '@playwright/test'

import { createNeed, loginAs, requestOfferFromDetail, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-06g: another user can respond to a request and create a pending exchange', async ({ page }) => {
  const title = uniqueTitle('FR-06g Need')

  // Create the request as the owner.
  await loginAs(page, USERS.ayse)
  const { detailUrl } = await createNeed(page, {
    title,
    description: 'Feature 6 FR-06g validates pending exchange creation from the request detail page.',
  })

  // A second user responds to the request from the public detail page.
  await switchUser(page, USERS.deniz)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)
  await expect(page.getByRole('button', { name: 'View Chat (Pending)' })).toBeVisible({ timeout: 10_000 })

  // The owner should immediately see that responder in the incoming pending requests list.
  await switchUser(page, USERS.ayse)
  await page.goto(detailUrl)
  await expect(page.getByText(USERS.deniz.name).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Pending').first()).toBeVisible({ timeout: 10_000 })
})
