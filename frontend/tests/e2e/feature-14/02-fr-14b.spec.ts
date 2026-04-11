import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  expectToast,
  setupCompletedExchange,
} from '../helpers'

test('FR-14b: users can select traits from both positive and negative categories when submitting service evaluation', async ({ page }) => {
  const title = uniqueTitle('FR-14b Offer')
  const provider = USERS.ayse
  const requester = USERS.mehmet

  // Reach completed state; page ends logged in as provider.
  const { serviceDetailUrl } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  // Requester opens service detail and clicks "Leave Evaluation".
  await switchUser(page, requester)
  await page.goto(serviceDetailUrl)
  await page.getByText(/Leave Evaluation/i).first().click()

  // Modal opens — positive traits visible under "Nice Traits".
  await expect(page.getByRole('button', { name: 'Punctual' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Kind' })).toBeVisible({ timeout: 10_000 })

  // Negative traits visible under "Needs Improvement".
  await expect(page.getByRole('button', { name: 'Late' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Unhelpful', exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Rude' })).toBeVisible({ timeout: 10_000 })

  // Select one positive trait and one negative trait.
  await page.getByRole('button', { name: 'Punctual' }).click()
  await page.getByRole('button', { name: 'Rude' }).click()

  // Submit — success toast confirms submission.
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()
  await expectToast(page, /Evaluation submitted/i)
})
