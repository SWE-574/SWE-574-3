/**
 * Feature 3 helpers — Admin Panel
 *
 * These are thin wrappers used exclusively in the feature-3 spec suite.
 * Generic admin auth helpers (loginAsAdmin, goToAdminTab, ADMIN_USERS) live
 * in helpers/admin.ts and are re-exported from the central barrel.
 */

import { type Page } from '@playwright/test'

/**
 * Click a sidebar navigation button by its visible label and wait for the
 * URL to reflect the active tab.
 */
export async function clickAdminSidebarItem(page: Page, label: string, expectedTabParam: string): Promise<void> {
  await page.getByRole('button', { name: label }).click()
  await page.waitForURL(`**/admin?tab=${expectedTabParam}`, { timeout: 10_000 })
}
