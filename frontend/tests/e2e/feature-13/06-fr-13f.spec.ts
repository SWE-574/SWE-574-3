import { test, expect } from '@playwright/test'

import { createServiceViaApi, loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-13f: anonymous users do not see protected action buttons and are redirected to login for protected interactions', async ({ page }) => {
  const title = uniqueTitle('FR-13f Offer')

  // Create a public listing first, then revisit it without an authenticated session.
  await loginAs(page, USERS.elif)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 FR-13f verifies anonymous protection on the detail page.',
    duration: 1,
    locationType: 'Online',
  })

  await page.context().clearCookies()
  await page.goto(created.detailUrl)
  await page.evaluate(() => {
    try {
      window.localStorage.clear()
      window.sessionStorage.clear()
    } catch {
      // Ignore storage access errors and continue with an anonymous check.
    }
  })
  await page.goto(created.detailUrl)

  // Anonymous viewers should get only the login CTA, not the protected request/respond buttons.
  await expect(page.getByRole('button', { name: 'Request this Service' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Offer to Help' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log In to Request' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Log In to Request' }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
})
