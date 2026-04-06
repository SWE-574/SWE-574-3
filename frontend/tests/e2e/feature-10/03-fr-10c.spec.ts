import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers'

test('FR-10c: private thread remains accessible after lifecycle closes', async ({ page }) => {
  // Demo data keeps a completed Cem-Burak conversation available in /messages.
  await loginAs(page, USERS.cem)
  await page.goto('/messages')

  const conversationRow = page.locator('button').filter({ hasText: /Burak|Chess/i }).first()
  await expect(conversationRow).toBeVisible({ timeout: 20_000 })
  await conversationRow.click()

  const messageInput = page.getByPlaceholder(/Write a message/i)
  await expect(messageInput).toBeVisible({ timeout: 10_000 })
})
