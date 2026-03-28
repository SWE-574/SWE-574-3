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

  const senderInput = senderPage.getByPlaceholder(/Write a message/i)
  const receiverThread = receiverPage.locator('[data-testid="chat-messages"], [role="log"], main')

  // Warm-up send to avoid counting initial socket/bootstrap overhead.
  const warmupMessage = uniqueText('NFR-10a warmup')
  await senderInput.fill(warmupMessage)
  await senderInput.press('Enter')
  await expect(receiverPage.getByText(warmupMessage).first()).toBeVisible({ timeout: 10_000 })

  const uniqueMessage = uniqueText('NFR-10a latency check')
  await senderInput.fill(uniqueMessage)

  const startedAt = Date.now()
  await senderInput.press('Enter')
  let deliveredAtMs = -1

  while (Date.now() - startedAt <= 1_000) {
    const isVisible = await receiverPage
      .getByText(uniqueMessage)
      .first()
      .isVisible()
      .catch(() => false)
    if (isVisible) {
      deliveredAtMs = Date.now()
      break
    }
    await receiverThread.waitFor({ state: 'visible', timeout: 100 }).catch(() => {})
    await receiverPage.waitForTimeout(50)
  }

  expect(deliveredAtMs).toBeGreaterThan(0)
  expect(deliveredAtMs - startedAt).toBeLessThanOrEqual(1_000)

  await senderContext.close()
  await receiverContext.close()
})
