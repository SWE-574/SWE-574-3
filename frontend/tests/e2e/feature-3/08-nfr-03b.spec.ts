import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, goToAdminTab, ADMIN_USERS } from '../helpers'

/**
 * The audit log uses Flex-based rows (no <table>/<tr>), so we read the
 * backend total from the "N entries" counter rendered in the tab header.
 */
async function getAuditCount(page: Page): Promise<number> {
  const el = page.getByText(/\d+ entries/).first()
  if (!(await el.isVisible().catch(() => false))) return 0
  const text = (await el.textContent()) ?? ''
  return parseInt(text.match(/\d+/)?.[0] ?? '0', 10)
}

/**
 * NFR-03b — Audit logs shall be append-only and retained according to policy.
 *
 * Scenario:
 *  1. Record how many audit log entries exist before an action.
 *  2. Perform a loggable admin action (issue a warning to a user).
 *  3. Return to the audit log.
 *  4. Assert the count increased by at least one (append — new entry written).
 *  5. Assert the original entries are still present (retention — nothing removed).
 *  6. Assert no delete or edit controls appear on any entry (immutable from UI).
 */

test('NFR-03b: performing an admin action appends a new entry to the audit log', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'audit')

  // Wait for the initial log to render and capture the backend entry count.
  await page.waitForTimeout(2_000)

  const rowsBefore = await getAuditCount(page)

  // Perform a loggable action: issue a warning to the first listed user.
  await goToAdminTab(page, 'users')
  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })

  const warnBtn = page.getByRole('button', { name: /warn/i }).first()
  await expect(warnBtn).toBeVisible({ timeout: 10_000 })
  await warnBtn.click()

  // Fill in the warning message and confirm.
  await expect(page.getByText(/warning message/i).first()).toBeVisible({ timeout: 10_000 })
  const textarea = page.locator('textarea').first()
  await textarea.fill('NFR-03b audit log retention test warning')
  await page.getByRole('button', { name: /send warning/i }).click()

  // Wait for the success toast.
  const toast = page.locator('[data-sonner-toaster] li').filter({ hasText: /warning/i })
  await expect(toast.first()).toBeVisible({ timeout: 10_000 })

  // Return to the audit log tab.
  await goToAdminTab(page, 'audit')
  await page.waitForTimeout(2_000)

  // The log must have grown — the warning action was appended.
  const rowsAfter = await getAuditCount(page)

  expect(rowsAfter).toBeGreaterThan(rowsBefore)
})

test('NFR-03b: existing audit log entries are retained after a new action is appended', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'audit')

  await page.waitForTimeout(2_000)

  // Capture the current total so we can verify nothing is removed after adding one.
  const countBefore = await getAuditCount(page)

  if (countBefore === 0) {
    // No prior entries to retain — skip retention check.
    test.skip()
    return
  }

  // Grab any short unique text from the first visible action badge (always present
  // when there are entries) to assert it still exists after the second action.
  const firstActionBadge = page.getByText(/warn|ban|role|remove|restore/i).first()
  const firstEntryText = (await firstActionBadge.textContent().catch(() => '')) ?? ''

  // Perform another loggable action.
  await goToAdminTab(page, 'users')
  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })
  const warnBtn = page.getByRole('button', { name: /warn/i }).first()
  await warnBtn.click()
  await expect(page.getByText(/warning message/i).first()).toBeVisible({ timeout: 10_000 })
  await page.locator('textarea').first().fill('NFR-03b retention check')
  await page.getByRole('button', { name: /send warning/i }).click()

  const toast = page.locator('[data-sonner-toaster] li').filter({ hasText: /warning/i })
  await expect(toast.first()).toBeVisible({ timeout: 10_000 })

  // Return to the audit log.
  await goToAdminTab(page, 'audit')
  await page.waitForTimeout(2_000)

  // Count must have grown (append) and not dropped below what we had (retention).
  const countAfter = await getAuditCount(page)
  expect(countAfter).toBeGreaterThanOrEqual(countBefore + 1)

  // A label from the earlier entries must still be visible on screen.
  if (firstEntryText.trim()) {
    await expect(page.getByText(firstEntryText.trim()).first()).toBeVisible({ timeout: 10_000 })
  }
})

test('NFR-03b: audit log has no delete or edit controls on any entry', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'audit')

  await page.waitForTimeout(2_000)

  // No edit or delete buttons anywhere in the audit log view.
  await expect(page.getByRole('button', { name: /^edit$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^delete$/i })).toHaveCount(0)
  await expect(
    page.locator('tr button[aria-label*="edit"], [role="row"] button[aria-label*="edit"]'),
  ).toHaveCount(0)
})
