import { test, expect } from '@playwright/test'
import { loginAsAdmin, goToAdminTab, ADMIN_USERS } from '../helpers'

test('FR-03c: admin can open the warn modal for a user', async ({ page }) => {
  // Load the user list and open the warn dialog for the first user.
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'users')

  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })

  const warnBtn = page.getByRole('button', { name: /warn/i }).first()
  await expect(warnBtn).toBeVisible({ timeout: 10_000 })
  await warnBtn.click()

  // Modal must contain the warning message textarea.
  await expect(page.getByText(/warning message/i).first()).toBeVisible({ timeout: 10_000 })

  // Dismiss without submitting.
  await page.getByRole('button', { name: /cancel/i }).first().click()
})

test('FR-03c: admin can open the suspend confirmation dialog for a user', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'users')

  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })

  const suspendBtn = page.getByRole('button', { name: /suspend/i }).first()
  await expect(suspendBtn).toBeVisible({ timeout: 10_000 })
  await suspendBtn.click()

  // Confirmation modal must describe the suspension action.
  await expect(page.getByText(/suspend/i).first()).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: /cancel/i }).first().click()
})

test('FR-03c: admin can open the karma adjustment modal', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'users')

  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })

  const karmaBtn = page.getByRole('button', { name: /karma/i }).first()
  await expect(karmaBtn).toBeVisible({ timeout: 10_000 })
  await karmaBtn.click()

  // Karma modal must be visible.
  await expect(page.getByText(/adjust karma/i).first()).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: /cancel/i }).first().click()
})

test('FR-03c: super-admin can access role management on the user detail page', async ({ page }) => {
  // Role assignment is a super-admin capability (FR-02f).
  await loginAsAdmin(page, ADMIN_USERS.superAdmin)
  await goToAdminTab(page, 'users')

  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })
  await page.getByText(/Elif|Cem|Ayşe/i).first().click()

  await expect(page).toHaveURL(/\/admin\/users\//, { timeout: 15_000 })

  // A "Change Role" or "Assign Role" control must be present.
  const roleControl = page.getByRole('button', { name: /role|assign/i }).first()
  await expect(roleControl).toBeVisible({ timeout: 15_000 })
})
