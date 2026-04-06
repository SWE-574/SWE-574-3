import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  setupCompletedExchange,
} from '../helpers'

test('NFR-14c: evaluation form clearly distinguishes required trait selection from optional review comment', async ({ page }) => {
  const title = uniqueTitle('NFR-14c Offer')
  const provider = USERS.elif
  const requester = USERS.deniz

  // Reach completed state; page ends logged in as provider.
  const { serviceDetailUrl } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  // Requester opens the evaluation modal.
  await switchUser(page, requester)
  await page.goto(serviceDetailUrl)
  await page.getByText(/Leave Evaluation/i).first().click()

  // Trait selection section must be labelled (required input indicator).
  await expect(page.getByText(/Select trait/i).first()).toBeVisible({ timeout: 10_000 })

  // Comment field must be labelled "optional".
  await expect(page.getByText(/optional/i).first()).toBeVisible()

  // Attempting to submit without selecting any trait should be blocked.
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()
  // Either a toast error or the form stays open without navigating away.
  const staysOpen = await page.getByText(/Select trait/i).isVisible({ timeout: 3_000 }).catch(() => false)
  const errorToast = await page.locator('[data-sonner-toaster] li').filter({ hasText: /select at least one/i }).isVisible({ timeout: 3_000 }).catch(() => false)
  expect(
    staysOpen || errorToast,
    'Submitting with no traits selected should show an error or keep the form open',
  ).toBeTruthy()
})
