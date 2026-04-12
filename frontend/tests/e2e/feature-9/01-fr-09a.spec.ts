import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  expectToast,
  futureDateParts,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('FR-09a: provider can submit meeting details, date/time, and final duration while the exchange is pending', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const { title } = await createPendingOfferExchange(page, {
    owner,
    requester,
    title: `FR-09a Offer ${Date.now()}`,
    duration: 1,
  })
  const { date, time } = futureDateParts(3)

  // The service owner opens the pending handshake and submits concrete remote session details.
  await switchUser(page, owner)
  await openConversationForService(page, title)
  await page.getByRole('button', { name: /Initiate Handshake/i }).click()
  await expect(page.getByText(/Provide session details/i).first()).toBeVisible({ timeout: 10_000 })

  await page.locator('input[type="date"]').fill(date)
  await page.locator('select').nth(0).selectOption(time.split(':')[0] ?? '10')
  await page.locator('select').nth(1).selectOption(time.split(':')[1] ?? '00')
  await page.getByRole('button', { name: 'Send Details' }).click()

  // The pending handshake should now wait for requester review without leaving the thread.
  await expectToast(page, /Session details sent/i)
  await expect(page.getByText(/Session details sent/i).first()).toBeVisible({ timeout: 10_000 })

  await switchUser(page, requester)
  await openConversationForService(page, title)
  await expect(page.getByRole('button', { name: 'Review & Approve' })).toBeVisible({ timeout: 10_000 })
})
