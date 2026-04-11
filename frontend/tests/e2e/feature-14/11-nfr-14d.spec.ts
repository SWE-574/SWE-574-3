import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  expectToast,
  setupCompletedExchange,
} from '../helpers'

/**
 * NFR-14d: Photo upload failure must not block evaluation submission.
 * The system shall save the evaluation and notify the user of the upload failure
 * separately (warning toast), then close the modal.
 */

test('NFR-14d: evaluation is saved even when image upload fails', async ({ page }) => {
  const title = uniqueTitle('NFR-14d Upload Fail')
  const provider = USERS.elif
  const requester = USERS.ayse

  const { serviceDetailUrl, handshakeId } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  await switchUser(page, requester)
  await page.goto(serviceDetailUrl)
  await page.getByText(/Leave Evaluation/i).first().click()

  await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Helpful', exact: true }).click()

  // Intercept the add-review request and force it to fail
  await page.route('**/reputation/add-review/**', (route) => {
    route.fulfill({ status: 500, body: JSON.stringify({ detail: 'Storage unavailable' }) })
  })

  // Attach a dummy file so the upload path is triggered
  const fileInput = page.locator('input[type="file"][accept="image/*"]')
  await fileInput.setInputFiles({
    name: 'fail.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), // minimal JPEG
  })

  await page.getByRole('button', { name: 'Submit Evaluation' }).click()

  // Success toast fires because the evaluation itself succeeded
  await expectToast(page, /Evaluation submitted/i)

  // A warning toast (not an error toast) for the failed upload
  await expectToast(page, /photo upload failed/i)

  // Modal closes — the evaluation is done
  await expect(page.getByRole('button', { name: 'Submit Evaluation' })).not.toBeVisible({ timeout: 5_000 })

  // The positive reputation record was created on the backend
  const repExists = await page.evaluate(async (hid: string) => {
    const res = await fetch(`/api/reputation/?handshake_id=${hid}`, {
      credentials: 'include',
    })
    if (!res.ok) return false
    const data = await res.json()
    const results = Array.isArray(data) ? data : (data.results ?? [])
    return results.some((r: { handshake?: string }) => r.handshake === hid)
  }, handshakeId)

  expect(repExists, 'Reputation record must exist even when image upload failed').toBeTruthy()
})

test('NFR-14d: evaluation modal closes after submission regardless of image upload outcome', async ({ page }) => {
  const title = uniqueTitle('NFR-14d Modal Close')
  const provider = USERS.elif
  const requester = USERS.ayse

  const { serviceDetailUrl } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  await switchUser(page, requester)
  await page.goto(serviceDetailUrl)
  await page.getByText(/Leave Evaluation/i).first().click()

  await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Helpful', exact: true }).click()

  // Force image upload to fail
  await page.route('**/reputation/add-review/**', (route) => {
    route.fulfill({ status: 503, body: '{}' })
  })

  const fileInput = page.locator('input[type="file"][accept="image/*"]')
  await fileInput.setInputFiles({
    name: 'fail2.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  })

  await page.getByRole('button', { name: 'Submit Evaluation' }).click()

  // Modal must close — submit button disappears
  await expect(
    page.getByRole('button', { name: 'Submit Evaluation' })
  ).not.toBeVisible({ timeout: 8_000 })
})
