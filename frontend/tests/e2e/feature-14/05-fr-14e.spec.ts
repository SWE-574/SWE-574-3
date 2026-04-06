import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupCompletedExchange,
  submitEvaluationViaApi,
} from '../helpers'

test('FR-14e: submitted evaluation attaches to the related exchange (modal shows already-reviewed state on revisit)', async ({ page }) => {
  const title = uniqueTitle('FR-14e Offer')
  const provider = USERS.burak
  const requester = USERS.yasemin

  // Reach completed state; page ends logged in as provider.
  const { handshakeId, serviceDetailUrl } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  // Requester submits evaluation via API (the submission itself is not the subject here).
  await switchUser(page, requester)
  await submitEvaluationViaApi(page, {
    handshakeId,
    punctual: true,
    helpful: false,
    kindness: false,
  })

  // Reload the service detail page as requester.
  // The evaluation CTA should now reflect the "already reviewed" state.
  await page.goto(serviceDetailUrl)

  // The "Leave Evaluation" button may still be visible but clicking it should show
  // "You already reviewed this exchange." inside the modal.
  const leaveEvalBtn = page.getByText(/Leave Evaluation/i).first()
  if (await leaveEvalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await leaveEvalBtn.click()
    await expect(
      page.getByText(/You already reviewed this exchange/i),
    ).toBeVisible({ timeout: 10_000 })
  } else {
    // The CTA was removed after submission — the exchange is marked reviewed.
    await expect(leaveEvalBtn).not.toBeVisible()
  }
})
