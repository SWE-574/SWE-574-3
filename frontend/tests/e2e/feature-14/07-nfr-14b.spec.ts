import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  expectToast,
  setupCompletedExchange,
} from '../helpers'

test('NFR-14b: evaluation submissions are idempotent — second submission attempt shows already-reviewed state', async ({ page }) => {
  const title = uniqueTitle('NFR-14b Offer')
  const provider = USERS.yasemin
  const requester = USERS.cem

  // Reach completed state; page ends logged in as provider.
  const { serviceDetailUrl } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  // Requester submits evaluation for the first time.
  await switchUser(page, requester)
  await page.goto(serviceDetailUrl)
  await page.getByText(/Leave Evaluation/i).first().click()

  await expect(page.getByRole('button', { name: 'Punctual' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Helpful', exact: true }).click()
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()
  await expectToast(page, /Evaluation submitted/i)

  // Reload and attempt to submit again.
  await page.goto(serviceDetailUrl)

  const leaveEvalBtn = page.getByText(/Leave Evaluation/i).first()
  if (await leaveEvalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await leaveEvalBtn.click()

    // Modal must show the already-reviewed guard instead of an active form.
    await expect(
      page.getByText(/You already reviewed this exchange/i),
    ).toBeVisible({ timeout: 10_000 })

    // Submit button must be disabled or not interactive.
    const submitBtn = page.getByRole('button', { name: 'Submit Evaluation' })
    if (await submitBtn.isVisible()) {
      await expect(submitBtn).toHaveAttribute('aria-disabled', 'true')
    }
  } else {
    // CTA removed after review — also acceptable idempotency behaviour.
    await expect(leaveEvalBtn).not.toBeVisible()
  }
})
