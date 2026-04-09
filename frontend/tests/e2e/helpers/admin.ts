import { type Page, expect } from '@playwright/test'

// ─── Admin / moderator credentials (seeded by setup_demo.py) ─────────────────
export const ADMIN_USERS = {
  /** Has admin-level access: user management, reports, comments, moderation */
  admin:      { email: 'moderator@demo.com',   password: 'demo123', name: 'Moderator'   },
  /** Has super-admin access: can also assign the admin role */
  superAdmin: { email: 'superadmin@demo.com',  password: 'demo123', name: 'Super Admin' },
} as const

export type AdminUser = (typeof ADMIN_USERS)[keyof typeof ADMIN_USERS]

/**
 * Log in as an admin/super-admin user and wait until the redirect away from
 * /login completes.
 */
export async function loginAsAdmin(page: Page, user: AdminUser): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(user.email)
  await page.locator('#password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })
}

/**
 * Navigate directly to an admin tab.
 * The 'dashboard' tab lives at /admin (no query param).
 */
export type AdminTab = 'dashboard' | 'users' | 'reports' | 'comments' | 'moderation' | 'audit'

export async function goToAdminTab(page: Page, tab: AdminTab): Promise<void> {
  const url = tab === 'dashboard' ? '/admin' : `/admin?tab=${tab}`
  await page.goto(url)
  // Wait for the sticky header to confirm the right tab is active
  const tabTitles: Record<AdminTab, string> = {
    dashboard:  'Admin Panel',
    users:      'User Management',
    reports:    'Reports & Flags',
    comments:   'Comment Moderation',
    moderation: 'Forum Topics',
    audit:      'Audit Logs',
  }
  await expect(page.getByText(tabTitles[tab]).first()).toBeVisible({ timeout: 15_000 })
}
