import { test, expect } from '@playwright/test'
import { createOffer, expectToast, loginAs, requestOfferFromDetail, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-05g: owner can remove an offer when there are no pending or accepted exchanges', async ({ page }) => {
  const removableTitle = uniqueTitle('FR-05g Removable Offer')

  // Create a clean offer with no related exchanges.
  await loginAs(page, USERS.cem)
  await createOffer(page, {
    title: removableTitle,
    description: 'Feature 5 FR-05g validates removable offer without related exchanges.',
  })

  // With no pending/accepted handshakes, removal should succeed.
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Remove Listing' }).click()
  await expectToast(page, /Listing removed/i)
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
})

test('FR-05g: owner cannot remove an offer while a pending exchange exists', async ({ page }) => {
  const lockedTitle = uniqueTitle('FR-05g Pending Lock Offer')

  // Create the offer as the owner.
  await loginAs(page, USERS.elif)
  const { detailUrl } = await createOffer(page, {
    title: lockedTitle,
    description: 'Feature 5 FR-05g validates lock while a pending exchange exists.',
  })

  // Another user creates a pending handshake on that offer.
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

  // Current behavior keeps the owner on the detail page and surfaces a toast
  // explaining that listings with existing handshakes cannot be removed yet.
  await expectToast(page, /existing handshakes|Cancel or complete those first/i)
  await expect(page).toHaveURL(new RegExp(detailUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10_000 })
  await expect(page.getByText(lockedTitle).first()).toBeVisible({ timeout: 10_000 })
})
