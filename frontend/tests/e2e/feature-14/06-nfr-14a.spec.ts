import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupCompletedExchange,
} from '../helpers'

test('NFR-14a: only users party to a completed exchange can access the evaluation CTA', async ({ page }) => {
  const title = uniqueTitle('NFR-14a Offer')
  const provider = USERS.mehmet
  const requester = USERS.ayse
  const thirdParty = USERS.burak

  // Reach completed state; page ends logged in as provider.
  const { serviceDetailUrl, handshakeId } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  // Third-party user views the service detail page — they are not part of the exchange.
  await switchUser(page, thirdParty)
  await page.goto(serviceDetailUrl)

  // "Leave Evaluation" must NOT be visible for a non-party user.
  await expect(page.getByText(/Leave Evaluation/i)).not.toBeVisible({ timeout: 10_000 })

  // Backend must also reject direct non-party API submissions.
  const positiveAttempt = await page.evaluate(async (data) => {
    const res = await fetch('/api/reputation/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return { status: res.status, body: await res.text() }
  }, {
    handshake_id: handshakeId,
    punctual: true,
    helpful: false,
    kindness: false,
  })
  expect(positiveAttempt.status).toBe(403)
  expect(positiveAttempt.body).toMatch(/not authorized|not a participant|permission denied/i)

  const negativeAttempt = await page.evaluate(async (data) => {
    const res = await fetch('/api/reputation/negative/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return { status: res.status, body: await res.text() }
  }, {
    handshake_id: handshakeId,
    is_late: true,
    is_unhelpful: false,
    is_rude: false,
  })
  expect(negativeAttempt.status).toBe(403)
  expect(negativeAttempt.body).toMatch(/not authorized|not a participant|permission denied/i)
})
