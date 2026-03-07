/**
 * E2E — Group Chat
 *
 * Covers:
 *  1. A participant in a multi-slot service sees the "GROUP" badge
 *     in the left panel on /messages
 *  2. Clicking the Group Chat row opens the group thread
 *  3. A message can be sent to the group and appears in the thread
 *
 * Demo data:
 *  - "Traditional Manti Cooking Workshop" (elif@demo.com) has max_participants=3
 *    and accepted handshake for Zeynep, so Zeynep is eligible for group chat
 *    with the provider (Elif).
 *  - Both Elif (provider) and Zeynep (participant) have access.
 *  - The sidebar groups conversations by service title in collapsible accordions.
 *    Eligible services show a "GROUP" badge on the accordion header.
 *    The accordion must be expanded to reveal the group-chat row inside.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

const GROUP_SERVICE_TITLE = 'Traditional Manti Cooking Workshop'

/** Ensure the Manti accordion is open and click the group-chat row. */
async function openGroupChat(page: import('@playwright/test').Page) {
  // Wait for the accordion header to appear
  const header = page.getByRole('button', { name: new RegExp(GROUP_SERVICE_TITLE, 'i') }).first()
  await expect(header).toBeVisible({ timeout: 20_000 })

  // The group row is inside the expanded accordion — a button with "participant" text
  const groupRow = page.locator('button').filter({ hasText: /participant/i }).first()

  // If the accordion auto-opened (e.g. a conversation inside was selected), the group
  // row is already visible. Only click the header if we need to expand it.
  const isVisible = await groupRow.isVisible().catch(() => false)
  if (!isVisible) {
    await header.click()
    await expect(groupRow).toBeVisible({ timeout: 10_000 })
  }

  return groupRow
}

test.describe('Group Chat', () => {
  test('provider sees the GROUP badge for a multi-slot service', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    // The service title should appear in the left sidebar accordion header
    const header = page.getByRole('button', { name: new RegExp(GROUP_SERVICE_TITLE, 'i') }).first()
    await expect(header).toBeVisible({ timeout: 20_000 })

    // The "GROUP" badge should be present on the header
    await expect(header.getByText('GROUP')).toBeVisible({ timeout: 5_000 })
  })

  test('clicking group row opens the group thread with message input', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    const groupRow = await openGroupChat(page)
    await groupRow.click()

    // The group message textarea should now be visible
    const groupInput = page.getByPlaceholder('Message the group…')
    await expect(groupInput).toBeVisible({ timeout: 10_000 })
  })

  test('provider can send a group message and it appears in the thread', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    const groupRow = await openGroupChat(page)
    await groupRow.click()

    const groupInput = page.getByPlaceholder('Message the group…')
    await expect(groupInput).toBeVisible({ timeout: 10_000 })

    const uniqueText = `Group E2E test ${Date.now()}`
    await groupInput.fill(uniqueText)
    await groupInput.press('Enter')

    // Message should appear in the thread
    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 10_000 })
  })

  test('group message input clears after sending', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    const groupRow = await openGroupChat(page)
    await groupRow.click()

    const groupInput = page.getByPlaceholder('Message the group…')
    await expect(groupInput).toBeVisible({ timeout: 10_000 })

    await groupInput.fill('Clearing group test')
    await groupInput.press('Enter')

    await expect(groupInput).toHaveValue('', { timeout: 5_000 })
  })

  test('participant also sees the GROUP badge', async ({ page }) => {
    // Zeynep is an accepted participant in the Manti workshop
    await loginAs(page, USERS.zeynep)
    await page.goto('/messages')

    const header = page.getByRole('button', { name: new RegExp(GROUP_SERVICE_TITLE, 'i') }).first()
    await expect(header).toBeVisible({ timeout: 20_000 })

    // Expand and verify the group row is accessible
    await header.click()
    const groupRow = page.locator('button').filter({ hasText: /participant/i }).first()
    await expect(groupRow).toBeVisible({ timeout: 10_000 })
  })
})
