import { test, expect } from '@playwright/test'

import {
  createRequestForTimeShare,
  loginAsUserWithBalanceAtLeast,
  openTimeActivity,
} from '../helpers'

test('FR-07h: users can open and browse their full Time Share transaction history', async ({ page }) => {
  // Create a fresh transaction so the history page has user-specific content to render.
  await loginAsUserWithBalanceAtLeast(page, 1)
  await createRequestForTimeShare(page, {
    title: `FR-07h Need ${Date.now()}`,
    duration: 1,
  })

  // Open the Time Activity page and verify the main browsing surfaces are available.
  await openTimeActivity(page)
  await expect(page.getByText(/^Time Available$/).first()).toBeVisible()
  await expect(page.getByText(/^Upcoming Time$/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'All' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Received' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Shared' })).toBeVisible()
  await expect(page.getByText(/entry|entries/i).first()).toBeVisible()
})
