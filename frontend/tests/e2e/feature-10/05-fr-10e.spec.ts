import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers'

test('FR-10e: private thread access is isolated to the thread members', async ({ page }) => {
  // Capture a private thread id from an actual participant.
  await loginAs(page, USERS.zeynep)
  const participantChatsResponse = await page.request.get('/api/chats/')
  expect(participantChatsResponse.ok()).toBeTruthy()
  const participantChatsPayload = await participantChatsResponse.json()
  const participantRows = participantChatsPayload.results ?? participantChatsPayload
  const participantHandshakeId = participantRows[0]?.handshake_id
  expect(participantHandshakeId).toBeTruthy()

  // Another user who is not part of that thread must be blocked.
  await loginAs(page, USERS.deniz)
  const outsiderResponse = await page.request.get(`/api/chats/${participantHandshakeId}/`)
  expect(outsiderResponse.status()).toBe(403)
})
