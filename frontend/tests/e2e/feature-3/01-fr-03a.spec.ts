import { test, expect } from '@playwright/test'
import { loginAsAdmin, goToAdminTab, ADMIN_USERS, clickAdminSidebarItem } from '../helpers'

test('FR-03a: admin user lands on the admin panel after navigating to /admin', async ({ page }) => {
  // Log in as admin and navigate to the admin root.
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await page.goto('/admin')

  // The sticky header must show "Admin Mode" — proof that the admin shell loaded.
  await expect(page.getByText('Admin Mode').first()).toBeVisible({ timeout: 10_000 })
})

test('FR-03a: admin dashboard shows the platform overview heading', async ({ page }) => {
  // Admin sees the dashboard tab by default.
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await goToAdminTab(page, 'dashboard')

  await expect(page.getByText('Admin Panel').first()).toBeVisible()
  await expect(page.getByText(/Platform overview/i).first()).toBeVisible()
})

test('FR-03a: admin can navigate to the User Management tab via sidebar', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await page.goto('/admin')

  await clickAdminSidebarItem(page, 'User Management', 'users')

  await expect(page.getByText('User Management').first()).toBeVisible({ timeout: 10_000 })
})

test('FR-03a: admin can navigate to the Reports & Flags tab via sidebar', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await page.goto('/admin')

  await clickAdminSidebarItem(page, 'Reports & Flags', 'reports')

  await expect(page.getByText('Reports & Flags').first()).toBeVisible({ timeout: 10_000 })
})

test('FR-03a: admin can navigate to the Comments tab via sidebar', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await page.goto('/admin')

  await clickAdminSidebarItem(page, 'Comments', 'comments')

  await expect(page.getByText('Comment Moderation').first()).toBeVisible({ timeout: 10_000 })
})

test('FR-03a: admin can navigate to the Forum Topics tab via sidebar', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await page.goto('/admin')

  await clickAdminSidebarItem(page, 'Forum Topics', 'moderation')

  await expect(page.getByText('Forum Topics').first()).toBeVisible({ timeout: 10_000 })
})

test('FR-03a: admin can navigate to the Audit Logs tab via sidebar', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)
  await page.goto('/admin')

  await clickAdminSidebarItem(page, 'Audit Logs', 'audit')

  await expect(page.getByText('Audit Logs').first()).toBeVisible({ timeout: 10_000 })
})

test('FR-03a: direct URL navigation to each tab opens the correct view', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.admin)

  const tabs = [
    { tab: 'users',      heading: 'User Management'   },
    { tab: 'reports',    heading: 'Reports & Flags'    },
    { tab: 'comments',   heading: 'Comment Moderation' },
    { tab: 'moderation', heading: 'Forum Topics'       },
    { tab: 'audit',      heading: 'Audit Logs'         },
  ]

  for (const { tab, heading } of tabs) {
    await page.goto(`/admin?tab=${tab}`)
    await expect(page.getByText(heading).first()).toBeVisible({ timeout: 15_000 })
  }
})

test('FR-03a: super-admin can also access and use the admin dashboard', async ({ page }) => {
  await loginAsAdmin(page, ADMIN_USERS.superAdmin)
  await page.goto('/admin')

  await expect(page.getByText('Admin Mode').first()).toBeVisible({ timeout: 15_000 })
})
