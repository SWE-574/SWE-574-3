import { expect, type Page } from '@playwright/test'

export async function openDashboardSearch(page: Page, title: string): Promise<void> {
  await page.goto('/dashboard')
  const searchInput = page.getByPlaceholder(/search/i).first()
  await expect(searchInput).toBeVisible({ timeout: 15_000 })
  await searchInput.fill(title)
}

export async function openServiceFromDashboard(page: Page, title: string): Promise<void> {
  await openDashboardSearch(page, title)
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 })
  await page.getByText(title).first().click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 15_000 })
}

export async function openConversationForService(page: Page, serviceTitle: string): Promise<void> {
  await page.goto('/messages')
  const conversationRow = page.locator('button').filter({ hasText: new RegExp(serviceTitle, 'i') }).first()
  await expect(conversationRow).toBeVisible({ timeout: 20_000 })
  await conversationRow.click()
}
