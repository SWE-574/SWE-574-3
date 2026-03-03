/**
 * E2E — Group Chat
 *
 * Covers:
 *  1. A participant in a multi-slot service sees the "Group Chat" row
 *     in the left panel on /messages
 *  2. Clicking the Group Chat row opens the group thread
 *  3. A message can be sent to the group and appears in the thread
 *
 * Demo data:
 *  - "Traditional Manti Cooking Workshop" (elif@demo.com) has max_participants=2
 *    and accepted handshakes for Cem and Zeynep, so both are eligible for group
 *    chat with the provider (Elif).
 *  - Tests run as Elif (the provider) who always has access to the group chat
 *    panel for her multi-participant service.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

const GROUP_SERVICE_TITLE = 'Traditional Manti Cooking Workshop'

test.describe('Group Chat', () => {
  test('provider sees the Group Chat row for a multi-slot service', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    // The service title should appear in the left sidebar
    await expect(
      page.getByText(GROUP_SERVICE_TITLE).first(),
    ).toBeVisible({ timeout: 20_000 })

    // The "Group Chat" label should be present somewhere in that service's section
    const groupChatRow = page.getByText('Group Chat')
    await expect(groupChatRow.first()).toBeVisible({ timeout: 10_000 })
  })

  test('clicking Group Chat opens the group thread with message input', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    // Click the Group Chat row
    await page.getByText('Group Chat').first().click()

    // The group message textarea should now be visible
    const groupInput = page.getByPlaceholder('Message the group…')
    await expect(groupInput).toBeVisible({ timeout: 10_000 })
  })

  test('provider can send a group message and it appears in the thread', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    await page.getByText('Group Chat').first().click()

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

    await page.getByText('Group Chat').first().click()

    const groupInput = page.getByPlaceholder('Message the group…')
    await expect(groupInput).toBeVisible({ timeout: 10_000 })

    await groupInput.fill('Clearing group test')
    await groupInput.press('Enter')

    await expect(groupInput).toHaveValue('', { timeout: 5_000 })
  })

  test('participant also sees the Group Chat row', async ({ page }) => {
    // Cem is an accepted participant in the Manti workshop
    await loginAs(page, USERS.cem)
    await page.goto('/messages')

    await expect(
      page.getByText(GROUP_SERVICE_TITLE).first(),
    ).toBeVisible({ timeout: 20_000 })

    const groupChatRow = page.getByText('Group Chat')
    await expect(groupChatRow.first()).toBeVisible({ timeout: 10_000 })
  })
})
