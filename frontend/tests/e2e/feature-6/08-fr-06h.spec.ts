import { test, expect } from '@playwright/test'

import { createNeed, expectToast, loginAs, requestOfferFromDetail, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-06h: owner can cancel a request before any exchange is initiated', async ({ page }) => {
  const title = uniqueTitle('FR-06h Need')

  // Create a clean request with no related exchanges.
  await loginAs(page, USERS.cem)
  await createNeed(page, {
    title,
    description: 'Feature 6 FR-06h validates removable request without related exchanges.',
  })

  // With no initiated exchange, removal should succeed.
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Remove Listing' }).click()
  await expectToast(page, /Listing removed/i)
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
})

test('FR-06h: owner cannot cancel a request after a responder has already created a pending exchange', async ({ page }) => {
  const title = uniqueTitle('FR-06h Locked Need')

  // Create the request as the owner.
  await loginAs(page, USERS.elif)
  const { detailUrl } = await createNeed(page, {
    title,
    description: 'Feature 6 FR-06h validates lock while a pending exchange exists.',
  })

  // Another user creates a pending exchange on that request.
  await switchUser(page, USERS.mehmet)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  // Owner tries to remove the listing but should be blocked by the existing handshake.
  await switchUser(page, USERS.elif)
  await page.goto(detailUrl)
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Remove Listing' }).click()

  await expectToast(page, /existing handshakes|Cancel or complete those first/i)
  await expect(page).toHaveURL(new RegExp(detailUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10_000 })
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
})
