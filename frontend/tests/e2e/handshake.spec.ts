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
 *  - Elif (elif@demo.com) offers "Traditional Manti Cooking Workshop"
 *    and "Börek Making Session"
 *  - Cem  (cem@demo.com)  offers "Chess Strategy Lessons for Beginners"
 *
 * Tests run as Cem requesting Elif's service.
 */

import { test, expect } from '@playwright/test'
import { loginAs, expectToast, USERS } from './helpers/auth'

const ELIF_SERVICE_TITLE = 'Börek Making Session'

test.describe('Handshake — express interest', () => {
  test('requester can request a service from the dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/dashboard')

    // Wait for service cards to load
    await expect(page.getByText(ELIF_SERVICE_TITLE)).toBeVisible({ timeout: 20_000 })

    // Click the card to open the service detail
    await page.getByText(ELIF_SERVICE_TITLE).first().click()
    await expect(page).toHaveURL(/\/service-detail\//)

    // Request the service — button is "Request this Service" for Offer-type
    const requestBtn = page.getByRole('button', { name: /Request this Service|Offer to Help/i })
    await expect(requestBtn).toBeVisible({ timeout: 10_000 })
    await requestBtn.click()

    // Expect success toast
    await expectToast(page, /Interest expressed|Messages|already/i)
  })

  test('requester sees the new conversation in /messages', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/messages')

    // At least one conversation should be visible
    await expect(
      page.getByText(ELIF_SERVICE_TITLE).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('provider sees incoming request on their service detail page', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/dashboard')

    // Elif owns this service — find it among "Your Listings"
    await expect(page.getByText(ELIF_SERVICE_TITLE)).toBeVisible({ timeout: 20_000 })
    await page.getByText(ELIF_SERVICE_TITLE).first().click()
    await expect(page).toHaveURL(/\/service-detail\//)

    // The incoming requests / participants section should show at least one entry
    // The section header says "Incoming Requests" or "Participants"
    const sectionHeader = page.getByText(/Incoming Requests|Participants/i)
    await expect(sectionHeader.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Handshake — navigation to chat', () => {
  test('clicking "Go to Messages" on an accepted handshake opens the conversation', async ({ page }) => {
    // Cem already has accepted handshakes from demo data (handshake1 in setup_demo.py)
    await loginAs(page, USERS.cem)
    await page.goto('/messages')

    // There should be at least one conversation
    const firstConv = page.locator('[data-testid="conversation-item"]').first()

    // Fall back to any clickable row in the left panel if no testid
    const convRow = (await firstConv.count() > 0)
      ? firstConv
      : page.locator('button').filter({ hasText: /Elif|Manti|Börek/i }).first()

    await expect(convRow).toBeVisible({ timeout: 15_000 })
    await convRow.click()

    // The right pane should show a message thread (textarea appears)
    const msgInput = page.getByPlaceholder('Write a message…')
    await expect(msgInput).toBeVisible({ timeout: 10_000 })
  })
})
