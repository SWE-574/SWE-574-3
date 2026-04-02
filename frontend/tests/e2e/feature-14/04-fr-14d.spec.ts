import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  expectToast,
  setupCompletedExchange,
  submitEvaluationViaApi,
} from '../helpers'

test('FR-14d: service receiver and provider can submit optional text review comment', async ({ page }) => {
  const title = uniqueTitle('FR-14d Offer')
  const reviewText = `Great experience - FR-14d review ${Date.now()}`
  const provider = USERS.elif
  const requester = USERS.cem

  // Reach completed state; page ends logged in as provider.
  const { serviceId, handshakeId, serviceDetailUrl } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  // Requester opens evaluation modal and submits with a text comment.
  await switchUser(page, requester)
  await page.goto(serviceDetailUrl)
  await page.getByText(/Leave Evaluation/i).first().click()

  await expect(page.getByRole('button', { name: 'Punctual' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Helpful', exact: true }).click()

  // Fill the optional comment field.
  await page.getByPlaceholder(/Write a short review/i).fill(reviewText)
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()
  await expectToast(page, /Evaluation submitted/i)

  // Reviews use blind evaluation — the comment is hidden until both parties submit.
  // Provider also submits their evaluation to unblind the requester's review.
  await switchUser(page, provider)
  await submitEvaluationViaApi(page, { handshakeId, punctual: true })

  // The text comment should now be visible in the service's comments section.
  await page.goto(`/service-detail/${serviceId}`)
  await expect(page.getByText(reviewText).first()).toBeVisible({ timeout: 15_000 })
})
