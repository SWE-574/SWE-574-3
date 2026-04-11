import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers'

test('NFR-10b: only authorized members can read or send in private threads', async ({ page }) => {
  // Unauthenticated access to messages page is blocked.
  await page.goto('/messages')
  await expect(page).toHaveURL(/\/login/)

  // Capture one legitimate thread id as a participant.
  await loginAs(page, USERS.zeynep)
  const participantChatsResponse = await page.request.get('/api/chats/')
  expect(participantChatsResponse.ok()).toBeTruthy()
  const participantChatsPayload = await participantChatsResponse.json()
  const participantRows = participantChatsPayload.results ?? participantChatsPayload
  const participantHandshakeId = participantRows[0]?.handshake_id
  expect(participantHandshakeId).toBeTruthy()

  // A different user should receive 403 for both read and send.
  await loginAs(page, USERS.deniz)
  const unauthorizedRead = await page.request.get(`/api/chats/${participantHandshakeId}/`)
  expect(unauthorizedRead.status()).toBe(403)

  const unauthorizedSend = await page.request.post('/api/chats/', {
    data: { handshake_id: participantHandshakeId, body: 'not allowed' },
  })
  expect(unauthorizedSend.status()).toBe(403)
})
