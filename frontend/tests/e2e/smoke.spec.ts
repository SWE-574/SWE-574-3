/**
 * E2E — Blocking smoke suite (critical path only).
 *
 * Run in CI as required; full E2E suite remains informational.
 * Covers: login → dashboard load → messages + send message → logout.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'
import { DEMO_SERVICE_PATTERN } from './helpers/demo-data'

test.describe('Smoke — critical path', () => {
  test('login → dashboard loads with service cards', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    await expect(
      page.getByText(DEMO_SERVICE_PATTERN).first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('messages list loads; user can send a message', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/messages')

    const convButtons = page.locator('button').filter({ hasText: /Cem|Ayşe|Zeynep|Can|member/i })
    await expect(convButtons.first()).toBeVisible({ timeout: 20_000 })
    await convButtons.first().click()

    const msgInput = page.getByPlaceholder(/Write a message|Message the group/i)
    await expect(msgInput.first()).toBeVisible({ timeout: 10_000 })

    const uniqueText = `Smoke ${Date.now()}`
    await msgInput.first().fill(uniqueText)
    await msgInput.first().press('Enter')

    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 10_000 })
  })

  test('logout redirects away from dashboard', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    const avatar = page.locator('img[alt="avatar"]')
    if (await avatar.isVisible().catch(() => false)) {
      await avatar.click()
    } else {
      await page.locator('nav').getByText(USERS.cem.name.split(' ').map(n => n[0]).join('')).click()
    }
    await page.getByText('Log Out').click()

    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 })
  })
})
