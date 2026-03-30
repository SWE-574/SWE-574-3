import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  futureDateParts,
  loginAs,
  openConversationForService,
  pickUsersWithBalanceAtLeast,
  switchUser,
  USERS,
} from '../helpers'

test('NFR-09c: handshake state updates render in-place without a full page refresh', async ({ browser, page }) => {
  const owner = USERS.elif
  const [{ user: requester }] = await pickUsersWithBalanceAtLeast(page, 2, 1, [owner.email])
  const { title } = await createPendingOfferExchange(page, {
    owner,
    requester,
    title: `NFR-09c Offer ${Date.now()}`,
    duration: 1,
  })
  const { date, time } = futureDateParts(3)

  const requesterContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost',
  })
  const requesterPage = await requesterContext.newPage()

  try {
    // Keep the requester on the open thread and wait for the owner-side update to arrive live.
    await loginAs(requesterPage, requester)
    await openConversationForService(requesterPage, title)
    await expect(requesterPage.getByText(/Waiting for the service owner/i).first()).toBeVisible({ timeout: 10_000 })
    const openThreadUrl = requesterPage.url()

    await switchUser(page, owner)
    await openConversationForService(page, title)
    await page.getByRole('button', { name: /Initiate Handshake/i }).click()
    await expect(page.getByText(/Provide session details/i).first()).toBeVisible({ timeout: 10_000 })

    await page.locator('input[type="date"]').fill(date)
    await page.locator('select').nth(0).selectOption(time.split(':')[0] ?? '10')
    await page.locator('select').nth(1).selectOption(time.split(':')[1] ?? '00')
    await page.getByRole('button', { name: 'Send Details' }).click()

    await expect(requesterPage.getByRole('button', { name: 'Review & Approve' })).toBeVisible({ timeout: 10_000 })
    expect(requesterPage.url()).toBe(openThreadUrl)
  } finally {
    await requesterContext.close()
  }
})
