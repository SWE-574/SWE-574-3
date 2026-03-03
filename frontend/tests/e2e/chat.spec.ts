/**
 * E2E — 1-to-1 Chat (handshake conversation)
 *
 * Covers:
 *  1. Authenticated user opens /messages
 *  2. Selects an existing conversation
 *  3. Types and sends a message
 *  4. The sent message appears in the thread
 *
 * Demo data: Cem ↔ Elif have a completed handshake (handshake1) so there
 * is guaranteed to be at least one conversation for both users.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('1-to-1 Chat', () => {
  test('conversation list loads with at least one item', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/messages')

    // The left panel should list conversations grouped by service
    // We look for any text belonging to Elif's services or Cem's own services
    await expect(
      page.locator('text=/Manti|Börek|Chess|Genealogy|Language/i').first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('user can select a conversation and the message input appears', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    // Find any conversation row and click it
    const convButtons = page.locator('button').filter({ hasText: /Cem|Ayşe|Zeynep|Can/i })
    await expect(convButtons.first()).toBeVisible({ timeout: 20_000 })
    await convButtons.first().click()

    // The message textarea should now be visible
    const msgInput = page.getByPlaceholder('Write a message…')
    await expect(msgInput).toBeVisible({ timeout: 10_000 })
  })

  test('user can send a message and it appears in the thread', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    // Open first available conversation
    const convButtons = page.locator('button').filter({ hasText: /Cem|Ayşe|Zeynep|Can/i })
    await expect(convButtons.first()).toBeVisible({ timeout: 20_000 })
    await convButtons.first().click()

    const msgInput = page.getByPlaceholder('Write a message…')
    await expect(msgInput).toBeVisible({ timeout: 10_000 })

    const uniqueText = `E2E test message ${Date.now()}`
    await msgInput.fill(uniqueText)

    // Send with Enter (Shift+Enter adds newline; plain Enter submits)
    await msgInput.press('Enter')

    // The message should appear in the chat thread
    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 10_000 })
  })

  test('message input clears after sending', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/messages')

    const convButtons = page.locator('button').filter({ hasText: /Elif|Traditional|Börek/i })
    await expect(convButtons.first()).toBeVisible({ timeout: 20_000 })
    await convButtons.first().click()

    const msgInput = page.getByPlaceholder('Write a message…')
    await expect(msgInput).toBeVisible({ timeout: 10_000 })

    await msgInput.fill('Clearing test message')
    await msgInput.press('Enter')

    // Input should be empty after sending
    await expect(msgInput).toHaveValue('', { timeout: 5_000 })
  })

  test('navigating directly to /messages/:handshakeId opens that conversation', async ({ page }) => {
    // Approach: login, go to /messages, grab the URL after clicking a conversation,
    // then verify the handshakeId-specific URL works on a fresh navigation.
    await loginAs(page, USERS.cem)
    await page.goto('/messages')

    const convButtons = page.locator('button').filter({ hasText: /Elif|Traditional|Börek/i })
    await expect(convButtons.first()).toBeVisible({ timeout: 20_000 })
    await convButtons.first().click()

    // Capture the URL that the app navigated to
    await page.waitForURL(/\/messages\//, { timeout: 10_000 })
    const directUrl = page.url()

    // Open that URL fresh (same session)
    await page.goto(directUrl)
    await expect(page.getByPlaceholder('Write a message…')).toBeVisible({ timeout: 15_000 })
  })
})
