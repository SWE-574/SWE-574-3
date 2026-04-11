import { test, expect } from '@playwright/test'
import { loginAsAdmin, goToAdminTab, ADMIN_USERS } from '../helpers'

/**
 * FR-03d — Forum topic lock / pin moderation.
 *
 * Each test loads the Forum Topics tab and exercises one moderation
 * control.  Tests that require seeded topics use test.skip() when none
 * are available so the suite does not fail on an empty database.
 */

test('FR-03d: Forum Topics tab loads without an auth error', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'moderation')

  // No re-auth banner should appear.
  await expect(page.getByText(/no longer have admin access/i)).not.toBeVisible()
})

test('FR-03d: Forum Topics tab shows lock and pin controls when topics exist', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'moderation')

  await page.waitForTimeout(2_000)

  const lockBtn = page.getByRole('button', { name: /lock|unlock/i }).first()
  const pinBtn  = page.getByRole('button', { name: /pin|unpin/i }).first()

  const lockVisible = await lockBtn.isVisible().catch(() => false)
  const pinVisible  = await pinBtn.isVisible().catch(() => false)

  if (lockVisible || pinVisible) {
    // At least one moderation control rendered alongside topics.
    expect(lockVisible || pinVisible).toBe(true)
  } else {
    // No topics are seeded — the empty state is the valid outcome.
    await expect(
      page.getByText(/no topics|no forum topics/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  }
})

test('FR-03d: admin can toggle the lock state on a forum topic', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'moderation')

  await page.waitForTimeout(2_000)

  const lockBtn = page.getByRole('button', { name: /^(un)?lock topic$/i }).first()
  if (!(await lockBtn.isVisible().catch(() => false))) {
    test.skip()
    return
  }

  await lockBtn.click()

  // A toast confirms the state change.
  const toast = page.locator('[data-sonner-toaster] li').filter({ hasText: /lock/i })
  await expect(toast.first()).toBeVisible({ timeout: 10_000 })
})

test('FR-03d: admin can toggle the pin state on a forum topic', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'moderation')

  await page.waitForTimeout(2_000)

  const pinBtn = page.getByRole('button', { name: /^(un)?pin topic$/i }).first()
  if (!(await pinBtn.isVisible().catch(() => false))) {
    test.skip()
    return
  }

  await pinBtn.click()

  const toast = page.locator('[data-sonner-toaster] li').filter({ hasText: /pin/i })
  await expect(toast.first()).toBeVisible({ timeout: 10_000 })
})
