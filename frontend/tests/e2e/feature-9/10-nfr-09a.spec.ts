import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  futureDateParts,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('NFR-09a: the current actor and expected next action stay explicit in the handshake UI', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const { title } = await createPendingOfferExchange(page, {
    owner,
    requester,
    title: `NFR-09a Offer ${Date.now()}`,
    duration: 1,
  })
  const { date, time } = futureDateParts(3)

  // The requester first sees that the provider is the required actor.
  await openConversationForService(page, title)
  await expect(page.getByText(/Waiting for the service owner/i).first()).toBeVisible({ timeout: 10_000 })

  // The owner side should make the pending action explicit.
  await switchUser(page, owner)
  await openConversationForService(page, title)
  await expect(page.getByRole('button', { name: /Initiate Handshake/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Initiate Handshake/i }).click()
  await expect(page.getByText(/Provide session details/i).first()).toBeVisible({ timeout: 10_000 })

  await page.locator('input[type="date"]').fill(date)
  await page.locator('select').nth(0).selectOption(time.split(':')[0] ?? '10')
  await page.locator('select').nth(1).selectOption(time.split(':')[1] ?? '00')
  await page.getByRole('button', { name: 'Send Details' }).click()

  // After the provider acts, the requester should see that the next decision belongs to them.
  await switchUser(page, requester)
  await openConversationForService(page, title)
  await expect(page.getByText(/Review the details and approve or decline/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Review & Approve' })).toBeVisible({ timeout: 10_000 })
})
