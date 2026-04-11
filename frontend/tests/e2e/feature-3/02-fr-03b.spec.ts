import { test, expect } from '@playwright/test'
import { loginAsAdmin, goToAdminTab, ADMIN_USERS } from '../helpers'

test('FR-03b: admin can view the user list in the User Management tab', async ({ page }) => {
  // Navigate to the user management tab.
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'users')

  // Demo data is seeded — at least one user name should be visible.
  await expect(
    page.getByText(/Elif|Cem|Ayşe|Mehmet|Zeynep/i).first(),
  ).toBeVisible({ timeout: 15_000 })
})

test('FR-03b: admin can search for a user by name', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'users')

  // Wait for initial load.
  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })

  // Type a name into the search input.
  const searchInput = page.getByPlaceholder(/search/i).first()
  await expect(searchInput).toBeVisible({ timeout: 10_000 })
  await searchInput.fill('Cem')

  // After the debounce fires the filtered result must contain Cem.
  await expect(page.getByText(/Cem/i).first()).toBeVisible({ timeout: 10_000 })
})

test('FR-03b: clicking a user row opens the admin user detail page', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'users')

  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })

  // Click the first listed user to open the detail view.
  await page.getByText(/Elif|Cem|Ayşe/i).first().click()

  await expect(page).toHaveURL(/\/admin\/users\//, { timeout: 15_000 })
})

test('FR-03b: user detail page shows profile information', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'users')

  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })
  await page.getByText(/Elif|Cem|Ayşe/i).first().click()

  await expect(page).toHaveURL(/\/admin\/users\//, { timeout: 15_000 })

  // Detail page must expose at least one profile field.
  await expect(
    page.getByText(/email|karma|joined|role/i).first(),
  ).toBeVisible({ timeout: 15_000 })
})
