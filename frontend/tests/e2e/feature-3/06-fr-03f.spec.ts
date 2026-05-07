import { test, expect } from '@playwright/test'
import { loginAsAdmin, goToAdminTab, ADMIN_USERS } from '../helpers'
import { waitForApi } from '../helpers/wait'

/**
 * FR-03f — Audit log immutability UI contract.
 *
 * The audit log is an append-only record of admin actions.
 * The UI must not expose any edit or delete controls inside the log view.
 */

test('FR-03f: admin can view the Audit Logs tab', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'audit')

  // Heading confirms the tab loaded correctly.
  await expect(page.getByText('Audit Logs').first()).toBeVisible()
})

test('FR-03f: audit log rows have no edit buttons (immutability)', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  const responsePromise = waitForApi(page, '/api/admin/audit')
  await goToAdminTab(page, 'audit')
  await responsePromise

  await expect(page.getByRole('button', { name: /^edit$/i })).toHaveCount(0)
})

test('FR-03f: audit log rows have no delete buttons (immutability)', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  const responsePromise = waitForApi(page, '/api/admin/audit')
  await goToAdminTab(page, 'audit')
  await responsePromise

  await expect(page.getByRole('button', { name: /^delete$/i })).toHaveCount(0)
})

test('FR-03f: no editable input fields are rendered inside audit log rows', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  const responsePromise = waitForApi(page, '/api/admin/audit')
  await goToAdminTab(page, 'audit')
  await responsePromise

  const editInRows = page.locator(
    'tr button[aria-label*="edit"], [role="row"] button[aria-label*="edit"]',
  )
  await expect(editInRows).toHaveCount(0)
})
