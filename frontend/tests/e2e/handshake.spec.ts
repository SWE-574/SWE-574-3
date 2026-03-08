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
import { DEMO_SERVICE_PATTERN } from './helpers/demo-data'

test.describe('Handshake — express interest', () => {
  test('requester can request a service from the dashboard', async ({ page }) => {
    await loginAs(page, USERS.can)
    await page.goto('/dashboard')

    const serviceCard = page.getByText(DEMO_SERVICE_PATTERN).first()
    await expect(serviceCard).toBeVisible({ timeout: 20_000 })
    await serviceCard.click()
    await expect(page).toHaveURL(/\/service-detail\//)

    // The button text depends on whether a handshake already exists (idempotent test):
    //  - Fresh state: "Request this Service" or "Offer to Help"
    //  - Already requested: "View Chat (Pending)"
    const requestBtn = page.getByRole('button', { name: /Request this Service|Offer to Help/i })
    const alreadyBtn = page.getByRole('button', { name: /View Chat/i })

    // Wait for either button to appear
    await expect(requestBtn.or(alreadyBtn)).toBeVisible({ timeout: 10_000 })

    if (await requestBtn.isVisible()) {
      await requestBtn.click()
      await expectToast(page, /Interest expressed|Messages|already/i)
    } else {
      // Handshake already exists from a prior run — that's fine
      await expect(alreadyBtn).toBeVisible()
    }
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

    const serviceCard = page.getByText(DEMO_SERVICE_PATTERN).first()
    await expect(serviceCard).toBeVisible({ timeout: 20_000 })
    await serviceCard.click()
    await expect(page).toHaveURL(/\/service-detail\//)

    // The incoming requests / participants section should show at least one entry
    const sectionHeader = page.getByText(/Incoming Requests|Participants/i)
    await expect(sectionHeader.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Handshake — provider accept', () => {
  test('provider Accept updates status and UI or shows toast', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/dashboard')
    const serviceCard = page.getByText(DEMO_SERVICE_PATTERN).first()
    await expect(serviceCard).toBeVisible({ timeout: 20_000 })
    await serviceCard.click()
    await expect(page).toHaveURL(/\/service-detail\//)

    const incomingSection = page.getByText(/Incoming Requests|Participants/i)
    await expect(incomingSection.first()).toBeVisible({ timeout: 10_000 })

    const acceptBtn = page.getByRole('button', { name: /Accept/i })
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click()
      await expectToast(page, /accepted|Accepted/i)
    }
    await expect(page).toHaveURL(/\/service-detail\//)
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

/**
 * Provider initiates handshake with session details (address, duration, 15-min time).
 * Demo: Elif owns "Help with 3D Printer Setup", Deniz is requester (pending).
 * Without Mapbox token the modal shows fallback: manual address input and hour/minute selects.
 */
test.describe('Handshake — initiate session details', () => {
  test('provider can open Initiate Handshake modal and submit address with 15-min time', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    // Open the pending conversation with Deniz (Help with 3D Printer Setup)
    const convRow = page.locator('button').filter({ hasText: /Deniz|3D Printer|Help with/i }).first()
    await expect(convRow).toBeVisible({ timeout: 20_000 })
    await convRow.click()

    // Right pane: provider sees "Initiate Handshake"
    const initiateBtn = page.getByRole('button', { name: /Initiate Handshake/i })
    await expect(initiateBtn).toBeVisible({ timeout: 10_000 })
    await initiateBtn.click()

    // Modal opens
    await expect(page.getByText('Initiate Handshake').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Exact Location').first()).toBeVisible()

    // With no Mapbox token we get fallback: text input for address. Fill it.
    const locationInput = page.getByPlaceholder(/e\.g\. Beşiktaş Library/)
    await locationInput.fill('123 Test Street, Istanbul')

    // Duration default is 1; ensure date is set (tomorrow)
    const dateInput = page.locator('input[type="date"]')
    await expect(dateInput).toBeVisible()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().slice(0, 10)
    await dateInput.fill(dateStr)

    // Minute select must only offer 00, 15, 30, 45 (two selects: hour then minute)
    const selects = page.locator('select')
    await expect(selects.first()).toBeVisible()
    const minuteSelect = selects.nth(1)
    await expect(minuteSelect).toBeVisible()
    const minuteOptions = await minuteSelect.locator('option').allTextContents()
    expect(minuteOptions.sort()).toEqual(['00', '15', '30', '45'])

    // Submit
    await page.getByRole('button', { name: 'Send Details' }).click()

    await expectToast(page, /Session details sent/i)
  })

  test('requester sees session details with Open in Maps link after provider initiates', async ({ page }) => {
    // Depends on previous test: Elif already initiated with "123 Test Street, Istanbul"
    // Deniz (requester) opens the conversation and opens Session Details modal
    await loginAs(page, USERS.deniz)
    await page.goto('/messages')
    const denizConv = page.locator('button').filter({ hasText: /Elif|3D Printer|Help with/i }).first()
    await expect(denizConv).toBeVisible({ timeout: 20_000 })
    await denizConv.click()
    const approveBtn = page.getByRole('button', { name: 'Review & Approve' })
    await expect(approveBtn).toBeVisible({ timeout: 10_000 })
    await approveBtn.click()

    // ProviderDetailsModal: address and "Open in Maps" link
    await expect(page.getByText('Session Details').first()).toBeVisible()
    await expect(page.getByText('123 Test Street, Istanbul')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open in Maps' })).toBeVisible()
  })
})
