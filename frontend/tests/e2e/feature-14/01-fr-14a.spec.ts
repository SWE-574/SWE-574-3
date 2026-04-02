import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  createPendingOfferExchange,
  initiateOnlineHandshakeViaApi,
  postHandshakeAction,
  completeOfferExchange,
} from '../helpers'

test('FR-14a: evaluation CTA is absent before COMPLETED and visible once exchange reaches COMPLETED state', async ({ page }) => {
  const title = uniqueTitle('FR-14a Offer')
  const provider = USERS.elif
  const requester = USERS.cem

  // Build exchange up to the pending state then accept it so it is in progress but NOT yet completed.
  const { serviceId } = await createPendingOfferExchange(page, {
    owner: provider,
    requester,
    title,
    duration: 1,
  })

  // As requester: service detail should NOT show a "Leave Evaluation" CTA.
  await page.goto(`/service-detail/${serviceId}`)
  await expect(page.getByText(/Leave Evaluation/i)).not.toBeVisible()

  // Provider initiates session details, requester approves → accepted state.
  await switchUser(page, provider)
  const handshakeId = await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration: 1,
  })

  await switchUser(page, requester)
  const approveResult = await postHandshakeAction(page, handshakeId, 'approve', {})
  expect(approveResult.ok, `Approve failed: ${approveResult.status}`).toBeTruthy()

  // Still accepted, not yet completed — no eval CTA.
  await page.goto(`/service-detail/${serviceId}`)
  await expect(page.getByText(/Leave Evaluation/i)).not.toBeVisible()

  // Both parties confirm → completed.
  await completeOfferExchange(page, { owner: provider, requester, serviceTitle: title })

  // After completion: requester sees the "Leave Evaluation" CTA on service detail.
  await switchUser(page, requester)
  await page.goto(`/service-detail/${serviceId}`)
  await expect(page.getByText(/Leave Evaluation/i).first()).toBeVisible({ timeout: 10_000 })
})
