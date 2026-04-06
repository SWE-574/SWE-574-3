import { test, expect } from '@playwright/test'

import {
  createServiceViaApi,
  loginAs,
  pickUsersWithBalanceAtLeast,
  switchUser,
  uniqueTitle,
  USERS,
} from '../helpers'

test('NFR-13d: detail layout remains usable on desktop and mobile viewports', async ({ browser, page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 1, 1, [owner.email])
  const title = uniqueTitle('NFR-13d Offer')

  // Create one reusable listing, then inspect the same detail page on two viewport sizes.
  await loginAs(page, owner)
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'Feature 13 NFR-13d checks responsive detail usability.',
    duration: 1,
    locationType: 'Online',
  })

  await switchUser(page, requester)
  await page.goto(created.detailUrl)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Request this Service' })).toBeVisible({ timeout: 10_000 })

  const mobileContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
    viewport: { width: 390, height: 844 },
  })
  const mobilePage = await mobileContext.newPage()

  try {
    // The same essential content and action should remain reachable on a narrow mobile viewport.
    await loginAs(mobilePage, requester)
    await mobilePage.goto(created.detailUrl)
    await expect(mobilePage.getByText(title).first()).toBeVisible({ timeout: 10_000 })
    await expect(mobilePage.getByRole('button', { name: 'Request this Service' })).toBeVisible({ timeout: 10_000 })
  } finally {
    await mobileContext.close()
  }
})
