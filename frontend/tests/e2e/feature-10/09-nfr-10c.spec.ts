import { test, expect } from '@playwright/test'
import { loginAs, USERS, uniqueText } from '../helpers'

test('NFR-10c: chat history remains after reconnect and page reload', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

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

  // Simulate reconnect with a full page teardown and fresh page in same auth context.
  await page.close()
  const reconnectedPage = await context.newPage()
  await reconnectedPage.goto('/messages')
  const reconnectedRow = reconnectedPage.locator('button').filter({ hasText: /Burak|Chess/i }).first()
  await expect(reconnectedRow).toBeVisible({ timeout: 20_000 })
  await reconnectedRow.click()
  await expect(reconnectedPage.getByText(uniqueMessage).first()).toBeVisible({ timeout: 10_000 })

  // Also validate plain reload path keeps message history visible.
  const reloadRow = reconnectedPage.locator('button').filter({ hasText: /Burak|Chess/i }).first()
  await expect(reloadRow).toBeVisible({ timeout: 20_000 })
  await reloadRow.click()
  await reconnectedPage.reload()
  await expect(reloadRow).toBeVisible({ timeout: 20_000 })
  await reloadRow.click()

  await expect(reconnectedPage.getByText(uniqueMessage).first()).toBeVisible({ timeout: 10_000 })
  await context.close()
})
