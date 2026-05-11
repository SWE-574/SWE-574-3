import { test, expect } from '@playwright/test'
import { createOffer, loginAs, uniqueTitle, USERS } from '../helpers'

test('NFR-05d: concurrent owner edit returns 409 and the first writer wins', async ({ browser, page }) => {
  const title = uniqueTitle('NFR-05d Offer')
  const firstEditTitle = `${title} First Edit`
  const secondEditDescription = 'Feature 5 NFR-05d second editor description.'

  // Create the offer once, then open the same edit page in two separate browser contexts.
  await loginAs(page, USERS.elif)
  const { detailUrl } = await createOffer(page, {
    title,
    description: 'Feature 5 NFR-05d original description.',
  })
  const editUrl = detailUrl.replace('/service-detail/', '/edit-service/')

  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
  })
  const secondPage = await context.newPage()
  await loginAs(secondPage, USERS.elif)

  await page.goto(editUrl)
  await secondPage.goto(editUrl)

  // First editor saves a title change. PATCH succeeds, version goes 0 -> 1.
  await page.locator('input[name="title"]').fill(firstEditTitle)
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })

  // Second editor still has version=0 in memory and submits stale data.
  // The backend optimistic-lock check rejects the write with 409 and the
  // form surfaces a non-blocking conflict toast with a Reload action.
  await secondPage.locator('textarea[name="description"]').fill(secondEditDescription)
  await secondPage.getByRole('button', { name: 'Save Changes' }).click()
  await expect(
    secondPage.locator('[data-sonner-toaster] li').filter({ hasText: /updated elsewhere/i }).first(),
  ).toBeVisible({ timeout: 10_000 })
  await expect(secondPage.getByRole('button', { name: 'Reload' })).toBeVisible({ timeout: 5_000 })
  // Form must stay open so the second editor's draft is not silently lost.
  await expect(secondPage).toHaveURL(/\/edit-service\//)

  // Re-open the detail page and confirm the first saved title and original
  // description survive — the stale write was rejected, not partially applied.
  await page.goto(detailUrl)
  await expect(page.getByText(firstEditTitle).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Feature 5 NFR-05d original description.').first()).toBeVisible({ timeout: 10_000 })

  await context.close()
})
