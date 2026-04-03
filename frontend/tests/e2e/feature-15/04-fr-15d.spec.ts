import { test, expect } from '@playwright/test'
import {
  loginAs,
  switchUser,
  uniqueTitle,
  USERS,
  createEventViaApi,
  joinEventViaApi,
  completeEventViaApi,
  submitPositiveEventEvalViaApi,
} from '../helpers'

test('FR-15d: organizer completing event transitions remaining CHECK-IN and JOINED participants to NO-SHOW', async ({ page }) => {
  const title = uniqueTitle('FR-15d Event')
  const organizer = USERS.deniz
  const noShowParticipant = USERS.yasemin

  // Participant joins but never reaches attended.
  const event = await createEventViaApi(page, organizer, { title })

  await switchUser(page, noShowParticipant)
  const handshakeId = await joinEventViaApi(page, event.id)

  // Organizer completes the event — remaining accepted participants become no_show.
  await switchUser(page, organizer)
  await completeEventViaApi(page, event.id)

  // No-show participant cannot submit evaluation.
  await switchUser(page, noShowParticipant)
  const evalResult = await submitPositiveEventEvalViaApi(page, handshakeId)
  expect(evalResult.status).toBe(404)

  // Event detail page must reflect the completed state.
  await page.goto(event.detailUrl)
  await expect(page.getByText(/Completed/i).first()).toBeVisible({ timeout: 10_000 })
})
