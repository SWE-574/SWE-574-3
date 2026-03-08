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
 *  - Ayşe (ayse@demo.com) offers "Watercolor Postcards for the Community Board"
 *  - Can  (can@demo.com) can request that service
 *
 * Initiate-session tests use Yasemin ↔ Elif on "Help Organizing Family Recipe Notes".
 * These tests are idempotent: they handle both fresh (pending) and already-initiated/approved states.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, expectToast, USERS } from './helpers/auth'

const TARGET_SERVICE = 'Watercolor Postcards for the Community Board'
const PENDING_INITIATE_SERVICE = 'Help Organizing Family Recipe Notes'

async function openServiceGroup(page: Page, serviceTitle: string) {
  const groupHeader = page.locator('button').filter({ hasText: new RegExp(serviceTitle, 'i') }).first()
  await expect(groupHeader).toBeVisible({ timeout: 20_000 })
  await groupHeader.click()
}

test.describe('Handshake — express interest', () => {
  test('requester can request a service from the dashboard', async ({ page }) => {
    await loginAs(page, USERS.can)
    await page.goto('/dashboard')

    await expect(page.getByText(TARGET_SERVICE).first()).toBeVisible({ timeout: 20_000 })
    await page.getByText(TARGET_SERVICE).first().click()
    await expect(page).toHaveURL(/\/service-detail\//)

    const requestBtn = page.getByRole('button', { name: /Request this Service|Offer to Help/i })
    const alreadyBtn = page.getByRole('button', { name: /View Chat/i })

    await expect(requestBtn.or(alreadyBtn)).toBeVisible({ timeout: 10_000 })

    if (await requestBtn.isVisible()) {
      await requestBtn.click()
      await expectToast(page, /Interest expressed|Messages|already/i)
    } else {
      await expect(alreadyBtn).toBeVisible()
    }
  })

  test('requester sees the new conversation in /messages', async ({ page }) => {
    await loginAs(page, USERS.can)
    await page.goto('/messages')

    await expect(
      page.locator('button').filter({ hasText: /Watercolor|Ayşe|Community Board/i }).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('provider sees incoming request on their service detail page', async ({ page }) => {
    await loginAs(page, USERS.ayse)
    await page.goto('/dashboard')

    await expect(page.getByText(TARGET_SERVICE).first()).toBeVisible({ timeout: 20_000 })
    await page.getByText(TARGET_SERVICE).first().click()
    await expect(page).toHaveURL(/\/service-detail\//)

    const sectionHeader = page.getByText(/Incoming Requests|Participants/i)
    await expect(sectionHeader.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Handshake — navigation to chat', () => {
  test('clicking a conversation opens the message thread', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/messages')

    const convRow = page.locator('button').filter({ hasText: /Burak|Chess/i }).first()
    await expect(convRow).toBeVisible({ timeout: 15_000 })
    await convRow.click()

    const msgInput = page.getByPlaceholder('Write a message…')
    await expect(msgInput).toBeVisible({ timeout: 10_000 })
  })
})

/**
 * Initiate-session tests (idempotent).
 *
 * Demo: Yasemin owns "Help Organizing Family Recipe Notes", Elif is requester.
 * Fresh DB: handshake is pending → provider sees "Initiate Handshake".
 * Re-run:   handshake may already be initiated/accepted → tests adapt.
 */
test.describe('Handshake — initiate session details', () => {
  test('provider can initiate or has already initiated session details', async ({ page }) => {
    await loginAs(page, USERS.yasemin)
    await page.goto('/messages')
    await openServiceGroup(page, PENDING_INITIATE_SERVICE)

    const initiateBtn = page.getByRole('button', { name: /Initiate Handshake/i })
    const alreadyInitiated = page.getByText(/Session details sent|Session Details|Confirm/i).first()

    // Either "Initiate Handshake" is visible (fresh) or details are already shown (re-run)
    await expect(initiateBtn.or(alreadyInitiated)).toBeVisible({ timeout: 10_000 })

    if (await initiateBtn.isVisible()) {
      await initiateBtn.click()
      await expect(page.getByText('Initiate Handshake').first()).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText('Exact Location').first()).toBeVisible()

      const locationInput = page.locator(
        'input[placeholder*="Nagihan Sokak"], input[placeholder*="Beşiktaş Library"]'
      ).first()
      await expect(locationInput).toBeVisible()
      await locationInput.fill('123 Test Street, Istanbul')

      const dateInput = page.locator('input[type="date"]')
      await expect(dateInput).toBeVisible()
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      await dateInput.fill(tomorrow.toISOString().slice(0, 10))

      const selects = page.locator('select')
      await expect(selects.first()).toBeVisible()
      const minuteSelect = selects.nth(1)
      const minuteOptions = await minuteSelect.locator('option').allTextContents()
      expect(minuteOptions.sort()).toEqual(['00', '15', '30', '45'])

      await page.getByRole('button', { name: 'Send Details' }).click()
      await expectToast(page, /Session details sent/i)
    }
    // Either way, session was initiated (now or earlier)
  })

  test('session summary in chat contains clickable Google Maps link', async ({ page }) => {
    await loginAs(page, USERS.yasemin)
    await page.goto('/messages')
    await openServiceGroup(page, PENDING_INITIATE_SERVICE)

    const mapsLink = page.locator('a[href*="google.com/maps"]').first()
    await expect(mapsLink).toBeVisible({ timeout: 15_000 })
    await expect(mapsLink).toHaveAttribute('href', /google\.com\/maps/)
    await expect(mapsLink).toHaveAttribute('target', '_blank')
  })

  test('requester sees session details with Open in Google Maps link', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')
    await openServiceGroup(page, PENDING_INITIATE_SERVICE)

    // If handshake is pending+initiated, requester sees "Review & Approve".
    // If already approved/accepted, the session details panel is shown directly.
    const approveBtn = page.getByRole('button', { name: 'Review & Approve' })
    const sessionDetails = page.getByText('Session Details').first()

    await expect(approveBtn.or(sessionDetails)).toBeVisible({ timeout: 10_000 })

    if (await approveBtn.isVisible()) {
      await approveBtn.click()
    }

    await expect(page.getByText('Session Details').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('link', { name: 'Open in Google Maps' })).toBeVisible()
  })
})
