import { test } from '@playwright/test'

import { createNeed, expectNavbarBalance, getCurrentBalance, loginAsUserWithBalanceAtLeast } from '../helpers'

test('FR-06d: request creation reserves hours equal to the request duration from available balance', async ({ page }) => {
  const title = `FR-06d Need ${Date.now()}`
  const duration = 1

  // Pick a user with extra headroom so the assertion is not left guessing
  // when a concurrent worker temporarily reserves on the same shared demo
  // account between the starting-balance read and createNeed.
  const { balance: startingBalance } = await loginAsUserWithBalanceAtLeast(page, duration + 2)

  await createNeed(page, {
    title,
    description: 'Feature 6 FR-06d verifies that request creation reserves the requested hours immediately.',
    duration,
    online: true,
  })

  // Move to a route where the balance pill is visible and confirm the reserved deduction.
  await page.goto('/notifications')
  await expectNavbarBalance(page, startingBalance - duration)

  // Cross-check the current user payload so the numeric deduction matches the visible balance change.
  const currentBalance = await getCurrentBalance(page)
  if (currentBalance !== startingBalance - duration) {
    throw new Error(`Expected balance ${startingBalance - duration}, received ${currentBalance}.`)
  }
})
