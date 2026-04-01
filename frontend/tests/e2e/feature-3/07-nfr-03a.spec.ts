import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'
import { loginAsAdmin, goToAdminTab, ADMIN_USERS } from '../helpers'

/**
 * NFR-03a — Admin route protection and permission cascade.
 *
 * Verifies that admin routes are inaccessible to unauthenticated visitors and
 * to authenticated regular members, and that back-navigation from a user detail
 * page returns the admin to the admin panel.
 */

test('NFR-03a: unauthenticated user visiting /admin is redirected to /login', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/admin')

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
})

test('NFR-03a: unauthenticated user visiting /admin/users/<id> is redirected to /login', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/admin/users/00000000-0000-0000-0000-000000000001')

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
})

test('NFR-03a: regular member cannot access the admin panel', async ({ page }) => {
  // Log in as a regular member and attempt to visit /admin.
  await loginAs(page, USERS.cem)
  await page.goto('/admin')

  // Must be redirected away — dashboard or login, but never the admin shell.
  await expect(page).not.toHaveURL(/^.*\/admin$/, { timeout: 15_000 })
  await expect(page.getByText('Admin Mode')).not.toBeVisible()
})

test('NFR-03a: regular member cannot access the users tab directly', async ({ page }) => {
  await loginAs(page, USERS.elif)
  await page.goto('/admin?tab=users')

  await expect(page).not.toHaveURL(/\/admin\?tab=users/, { timeout: 15_000 })
})

test('NFR-03a: back navigation from a user detail page returns to the admin panel', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'users')

  // Open a user detail page.
  await expect(page.getByText(/Elif|Cem|Ayşe/i).first()).toBeVisible({ timeout: 15_000 })
  await page.getByText(/Elif|Cem|Ayşe/i).first().click()
  await expect(page).toHaveURL(/\/admin\/users\//, { timeout: 15_000 })

  // Use the back button if rendered, otherwise the browser back action.
  const backBtn = page.getByRole('button', { name: /back/i }).first()
  if (await backBtn.isVisible().catch(() => false)) {
    await backBtn.click()
  } else {
    await page.goBack()
  }

  // Must land somewhere inside the admin panel.
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 })
})
