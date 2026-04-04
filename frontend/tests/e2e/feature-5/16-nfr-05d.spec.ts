import { test, expect } from '@playwright/test'
import { createOffer, loginAs, uniqueTitle, USERS } from '../helpers'

test('NFR-05d: concurrent edits do not cause silent data loss', async ({ browser, page }) => {
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

  // First editor saves a title change.
  await page.locator('input[name="title"]').fill(firstEditTitle)
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })

  // Second editor saves stale data afterward; this test checks for silent overwrite risk.
  await secondPage.locator('textarea[name="description"]').fill(secondEditDescription)
  await secondPage.getByRole('button', { name: 'Save Changes' }).click()

  // Re-open the detail page and confirm the first saved title is still present.
  await page.goto(detailUrl)
  await expect(page.getByText(firstEditTitle).first()).toBeVisible({ timeout: 10_000 })

  await context.close()
})
