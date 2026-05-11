import { test, expect } from '@playwright/test'
import { loginAs, USERS, uniqueText } from '../helpers'

test('NFR-10a: private chat delivery completes within one second once the receiver is subscribed', async ({ browser }) => {
  // The 1s NFR is a steady-state delivery budget — once both peers are
  // connected to /ws/chat/<handshake>, an outgoing message must reach the
  // counterpart in under a second. The earlier failure mode was the
  // receiver context being cold-bootstrapped *during* the timer, which
  // measured the WS auth + handshake instead of the broadcast cost.
  //
  // The receiver-side warm-up below (round-trip a warm-up message through
  // the receiver's own input) proves the receiver's WS is live before the
  // measurement starts. The actual NFR assertion runs on a pre-warmed
  // socket, which matches the spec intent.
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

  await loginAs(receiverPage, USERS.burak)
  await receiverPage.goto(`/messages/${handshakeId}`)

  const receiverInput = receiverPage.getByPlaceholder(/Write a message/i)
  await expect(receiverInput).toBeVisible({ timeout: 20_000 })

  // Round-trip a warm-up from sender -> receiver and receiver -> sender so
  // both sides have proven their WS is connected. If either subscription
  // were still cold, neither warm-up would land within the 10s envelope.
  const warmupFromSender = uniqueText('NFR-10a warmup sender')
  await senderInput.fill(warmupFromSender)
  await senderInput.press('Enter')
  await expect(receiverPage.getByText(warmupFromSender).first()).toBeVisible({ timeout: 10_000 })

  const warmupFromReceiver = uniqueText('NFR-10a warmup receiver')
  await receiverInput.fill(warmupFromReceiver)
  await receiverInput.press('Enter')
  await expect(senderPage.getByText(warmupFromReceiver).first()).toBeVisible({ timeout: 10_000 })

  // Both subscriptions are live. The next send measures the steady-state
  // delivery time only.
  const uniqueMessage = uniqueText('NFR-10a latency check')
  await senderInput.fill(uniqueMessage)

  const startedAt = Date.now()
  await senderInput.press('Enter')
  await expect(receiverPage.getByText(uniqueMessage).first()).toBeVisible({ timeout: 1_000 })
  const deliveredAtMs = Date.now()

  expect(deliveredAtMs - startedAt).toBeLessThanOrEqual(1_000)

  await senderContext.close()
  await receiverContext.close()
})
