import { test, expect } from '@playwright/test'
import { loginAs, USERS, uniqueText } from '../helpers'

test('NFR-10a: private chat delivery should complete within one second', async ({ browser }) => {
  const senderContext = await browser.newContext()
  const receiverContext = await browser.newContext()
  const senderPage = await senderContext.newPage()
  const receiverPage = await receiverContext.newPage()

  // Open the sender first so the private thread is created before the receiver joins.
  await loginAs(senderPage, USERS.cem)
  await senderPage.goto('/messages')

  const senderRow = senderPage.getByRole('button', { name: /Burak Kurt/i }).first()
  await expect(senderRow).toBeVisible({ timeout: 20_000 })
  await senderRow.click()
  await expect(senderPage).toHaveURL(/\/messages\/[^/]+/, { timeout: 10_000 })
  const handshakeId = senderPage.url().split('/messages/')[1]

  const senderInput = senderPage.getByPlaceholder(/Write a message/i)

  // Warm-up send to avoid counting initial socket/bootstrap overhead.
  const warmupMessage = uniqueText('NFR-10a warmup')
  await senderInput.fill(warmupMessage)
  await senderInput.press('Enter')

  await loginAs(receiverPage, USERS.burak)
  await receiverPage.goto(`/messages/${handshakeId}`)

  const receiverThread = receiverPage.locator('[data-testid="chat-messages"], [role="log"], main')

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
