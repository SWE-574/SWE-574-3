import { test, expect } from '@playwright/test'
import { loginAs, USERS, uniqueText } from '../helpers'

test('NFR-10c: chat history remains after reconnect and page reload', async ({ page }) => {
  await loginAs(page, USERS.cem)
  await page.goto('/messages')

  const conversationRow = page.locator('button').filter({ hasText: /Burak|Chess/i }).first()
  await expect(conversationRow).toBeVisible({ timeout: 20_000 })
  await conversationRow.click()

  const messageInput = page.getByPlaceholder(/Write a message/i)
  await expect(messageInput).toBeVisible({ timeout: 10_000 })
  const uniqueMessage = uniqueText('NFR-10c reconnect')
  await messageInput.fill(uniqueMessage)
  await messageInput.press('Enter')
  await expect(page.getByText(uniqueMessage).first()).toBeVisible({ timeout: 10_000 })

  // Simulate temporary disconnect/reconnect by reloading the page.
  await page.reload()
  await expect(conversationRow).toBeVisible({ timeout: 20_000 })
  await conversationRow.click()

  await expect(page.getByText(uniqueMessage).first()).toBeVisible({ timeout: 10_000 })
})
