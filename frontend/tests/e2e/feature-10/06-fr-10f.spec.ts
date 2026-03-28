import { test, expect } from '@playwright/test'
import { loginAs, USERS, uniqueText } from '../helpers'

test('FR-10f: user-sent private messages are delivered in near real time', async ({ browser }) => {
  const senderContext = await browser.newContext()
  const receiverContext = await browser.newContext()
  const senderPage = await senderContext.newPage()
  const receiverPage = await receiverContext.newPage()

  // Use the seeded Cem-Burak private conversation.
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

  const uniqueMessage = uniqueText('FR-10f realtime check')
  const senderInput = senderPage.getByPlaceholder(/Write a message/i)
  await expect(senderInput).toBeVisible({ timeout: 10_000 })
  await senderInput.fill(uniqueMessage)
  await senderInput.press('Enter')

  await expect(receiverPage.getByText(uniqueMessage).first()).toBeVisible({ timeout: 5_000 })

  await senderContext.close()
  await receiverContext.close()
})
