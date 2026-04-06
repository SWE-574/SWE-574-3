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

test('FR-08c: provider can submit final session details while the exchange is pending', async ({ page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const { title } = await createPendingOfferExchange(page, {
    owner,
    requester,
    title: `FR-08c Offer ${Date.now()}`,
    duration: 1,
  })
  const { date, time } = futureDateParts(3)

  // The service owner opens the pending chat and proposes concrete session details.
  await switchUser(page, owner)
  await openConversationForService(page, title)
  await page.getByRole('button', { name: /Initiate Handshake/i }).click()
  await expect(page.getByText(/Provide session details/i).first()).toBeVisible({ timeout: 10_000 })

  await page.locator('input[type="date"]').fill(date)
  await page.locator('select').nth(0).selectOption(time.split(':')[0] ?? '10')
  await page.locator('select').nth(1).selectOption(time.split(':')[1] ?? '00')
  await page.getByRole('button', { name: 'Send Details' }).click()

  // The pending exchange should now show the submitted details and wait for requester review.
  await expectToast(page, /Session details sent/i)
  await expect(page.getByText(/Session details sent/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(requester.name).first()).toBeVisible({ timeout: 10_000 })
})
