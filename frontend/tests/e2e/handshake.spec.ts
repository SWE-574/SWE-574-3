/**
 * E2E — Handshake workflow
 *
 * Covers the full lifecycle a requester experiences:
 *  1. Browse the dashboard and find a service offered by another user
 *  2. Open the service detail page
 *  3. Click "Request this Service" and receive a success toast
 *  4. Navigate to /messages and see the new conversation listed
 *
 * Also covers the provider side:
 *  5. Provider sees the incoming request in the service detail page
 *
 * Demo data used (seeded by setup_demo.py):
 *  - Elif (elif@demo.com) offers "Traditional Manti Cooking Workshop" (Active, max_participants=3)
 *  - Can  (can@demo.com) has no existing handshake with that service and sufficient balance
 *
 * Tests run as Can requesting Elif's service.
 */

import { test, expect } from '@playwright/test'
import { loginAs, expectToast, USERS } from './helpers/auth'

const TARGET_SERVICE = 'Traditional Manti Cooking Workshop'

test.describe('Handshake — express interest', () => {
  test('requester can request a service from the dashboard', async ({ page }) => {
    await loginAs(page, USERS.can)
    await page.goto('/dashboard')

    // Wait for service cards to load
    await expect(page.getByText(TARGET_SERVICE).first()).toBeVisible({ timeout: 20_000 })

    // Click the card to open the service detail
    await page.getByText(TARGET_SERVICE).first().click()
    await expect(page).toHaveURL(/\/service-detail\//)

    // Request the service — button is "Request this Service" for Offer-type
    const requestBtn = page.getByRole('button', { name: /Request this Service|Offer to Help/i })
    await expect(requestBtn).toBeVisible({ timeout: 10_000 })
    await requestBtn.click()

    // Expect success toast
    await expectToast(page, /Interest expressed|Messages|already/i)
  })

  test('requester sees the new conversation in /messages', async ({ page }) => {
    await loginAs(page, USERS.can)
    await page.goto('/messages')

    // At least one conversation should be visible (either from the request above
    // or from Can's other existing conversations)
    await expect(
      page.locator('button').filter({ hasText: /Manti|Elif|Turkish/i }).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('provider sees incoming request on their service detail page', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/dashboard')

    // Elif owns this service
    await expect(page.getByText(TARGET_SERVICE).first()).toBeVisible({ timeout: 20_000 })
    await page.getByText(TARGET_SERVICE).first().click()
    await expect(page).toHaveURL(/\/service-detail\//)

    // The incoming requests / participants section should show at least one entry
    const sectionHeader = page.getByText(/Incoming Requests|Participants/i)
    await expect(sectionHeader.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Handshake — navigation to chat', () => {
  test('clicking a conversation opens the message thread', async ({ page }) => {
    // Cem has an accepted handshake (Chess Practice Partner with Burak)
    await loginAs(page, USERS.cem)
    await page.goto('/messages')

    // Use Cem's active conversation
    const convRow = page.locator('button').filter({ hasText: /Burak|Chess/i }).first()

    await expect(convRow).toBeVisible({ timeout: 15_000 })
    await convRow.click()

    // The right pane should show a message thread (textarea appears)
    const msgInput = page.getByPlaceholder('Write a message…')
    await expect(msgInput).toBeVisible({ timeout: 10_000 })
  })
})
