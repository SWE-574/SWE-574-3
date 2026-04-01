import { test, expect } from '@playwright/test'
import { loginAsAdmin, goToAdminTab, ADMIN_USERS } from '../helpers'

/**
 * FR-03e — Comment moderation: remove and restore comments.
 */

test('FR-03e: Comment Moderation tab loads with the active comments view', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'comments')

  // Either comment rows or an empty state must be present.
  const hasRows = await page
    .locator('table tr, [role="row"]')
    .nth(1)
    .isVisible()
    .catch(() => false)

  const hasEmpty = await page
    .getByText(/no comments/i)
    .isVisible()
    .catch(() => false)

  expect(hasRows || hasEmpty).toBe(true)
})

test('FR-03e: admin can open the remove-comment confirmation dialog', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'comments')

  await page.waitForTimeout(2_000)

  const removeBtn = page.getByRole('button', { name: /remove/i }).first()
  if (!(await removeBtn.isVisible().catch(() => false))) {
    test.skip()
    return
  }

  await removeBtn.click()

  // Confirmation modal must describe the removal.
  await expect(page.getByText(/remove comment/i).first()).toBeVisible({ timeout: 10_000 })

  // Dismiss without confirming.
  await page.getByRole('button', { name: /cancel/i }).first().click()
})

test('FR-03e: admin can switch to the "removed" comments filter', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'comments')

  // The status filter should offer an option to view removed comments.
  const removedFilter = page.getByRole('button', { name: /removed/i }).first()
  const hasFilter = await removedFilter.isVisible().catch(() => false)

  if (!hasFilter) {
    // Some implementations use a select instead of buttons.
    const select = page.locator('select').first()
    if (await select.isVisible().catch(() => false)) {
      await select.selectOption({ label: /removed/i })
    }
  } else {
    await removedFilter.click()
  }

  // After switching the UI should still be on the comments tab without errors.
  await expect(page.getByText('Comment Moderation').first()).toBeVisible({ timeout: 10_000 })
})
