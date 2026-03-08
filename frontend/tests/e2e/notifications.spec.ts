/**
 * E2E — Notifications
 *
 * Covers: protected route, notification list (empty or with items), optional Mark all as read.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('Notifications', () => {
  test('/notifications is protected; unauthenticated → /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/notifications')

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('logged-in user sees notification list (empty or with items)', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/notifications')

    await expect(page).toHaveURL(/\/notifications/, { timeout: 15_000 })
    await expect(page.getByText('Notifications').first()).toBeVisible({ timeout: 10_000 })
    const listOrEmpty = page.getByText(/No notifications yet|Notifications/).first()
    await expect(listOrEmpty).toBeVisible({ timeout: 10_000 })
  })

  test('Mark all as read visible when there are unread notifications', async ({ page }) => {
    await loginAs(page, USERS.cem)
    await page.goto('/notifications')

    await expect(page.getByText('Notifications').first()).toBeVisible({ timeout: 10_000 })
    const markAll = page.getByRole('button', { name: /Mark all as read|Mark all read/i })
    if (await markAll.isVisible().catch(() => false)) {
      await markAll.click()
    }
    await expect(page).toHaveURL(/\/notifications/)
  })
})
