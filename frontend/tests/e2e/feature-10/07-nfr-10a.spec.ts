import { test, expect } from '@playwright/test'
import { loginAs, USERS, uniqueText } from '../helpers'

test('NFR-10a: private chat delivery should complete within one second', async ({ browser }) => {
  const senderContext = await browser.newContext()
  const receiverContext = await browser.newContext()
  const senderPage = await senderContext.newPage()
  const receiverPage = await receiverContext.newPage()

  await loginAs(senderPage, USERS.cem)
  await loginAs(receiverPage, USERS.burak)
  await senderPage.goto('/messages')
  await receiverPage.goto('/messages')

  const senderRow = senderPage.locator('button').filter({ hasText: /Burak|Chess/i }).first()
  const receiverRow = receiverPage.locator('button').filter({ hasText: /Cem|Chess/i }).first()
  await expect(senderRow).toBeVisible({ timeout: 20_000 })
  await expect(receiverRow).toBeVisible({ timeout: 20_000 })
  await senderRow.click()
  await receiverRow.click()

  const uniqueMessage = uniqueText('NFR-10a latency check')
  const senderInput = senderPage.getByPlaceholder(/Write a message/i)
  await senderInput.fill(uniqueMessage)

  const startedAt = Date.now()
  await senderInput.press('Enter')
  await expect(receiverPage.getByText(uniqueMessage).first()).toBeVisible({ timeout: 5_000 })
  const latencyMs = Date.now() - startedAt

  expect(latencyMs).toBeLessThanOrEqual(1000)

  await senderContext.close()
  await receiverContext.close()
})
