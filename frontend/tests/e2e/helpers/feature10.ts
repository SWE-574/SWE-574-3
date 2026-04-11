import { expect, type Page } from '@playwright/test'

export function uniqueText(prefix: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `${prefix} ${suffix}`
}

export async function openServiceAccordion(page: Page, serviceTitle: string): Promise<void> {
  const header = page
    .getByRole('button', { name: new RegExp(serviceTitle, 'i') })
    .first()

  await expect(header).toBeVisible({ timeout: 20_000 })
  await header.click()
}

export async function openFirstConversationRow(page: Page, matcher: RegExp): Promise<void> {
  const row = page.locator('button').filter({ hasText: matcher }).first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()
}
