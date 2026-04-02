import { test, expect } from '@playwright/test'

import { fetchCurrentUser, registerFreshUser } from '../helpers'

test('FR-07a: each newly registered user starts with an initial available balance of 3 hours', async ({ page }) => {
  // Register a brand-new user so the initial Time Share allocation is created from scratch.
  const account = await registerFreshUser(page)

  // Read the authenticated profile payload to confirm the starting balance was provisioned.
  const currentUser = await fetchCurrentUser(page)
  expect(currentUser.email).toBe(account.email)
  expect(currentUser.timebank_balance).toBe(3)

  // Open onboarding and verify the same initial balance is visible in the signed-in UI.
  await page.goto('/onboarding')
  await expect(page.getByText(/Your time available:/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/3 hours/i)).toBeVisible()
})
