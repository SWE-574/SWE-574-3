import { test, expect } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  expectToast,
  setupCompletedExchange,
} from '../helpers'

/**
 * FR-14f: Users can attach up to 3 photos (JPG/PNG/GIF/WebP, ≤10 MB each)
 * to a review comment during evaluation submission.
 */

// Minimal valid JPEG (1×1 pixel) as a Buffer — no fixture file needed.
const SAMPLE_JPEG = {
  name: 'sample.jpg',
  mimeType: 'image/jpeg' as const,
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
    0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]),
}

test('FR-14f: user can attach a photo when submitting evaluation', async ({ page }) => {
  const title = uniqueTitle('FR-14f Photo Offer')
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

  // Select at least one positive trait
  await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Helpful', exact: true }).click()

  // Attach a photo using the file input inside the modal
  const fileInput = page.locator('input[type="file"][accept="image/*"]')
  await fileInput.setInputFiles(SAMPLE_JPEG)

  // Thumbnail preview should appear
  await expect(page.locator('img[alt="Preview 1"]')).toBeVisible({ timeout: 5_000 })

  await page.getByRole('button', { name: 'Submit Evaluation' }).click()
  await expectToast(page, /Evaluation submitted/i)
})

test('FR-14f: camera icon button is present in evaluation modal', async ({ page }) => {
  const title = uniqueTitle('FR-14f Camera UI')
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

  await expect(page.locator('input[type="file"][accept="image/*"]')).toBeAttached({ timeout: 10_000 })
  // The label containing the file input should be visible (camera trigger)
  await expect(page.locator('label:has(input[type="file"])').first()).toBeVisible()
})

test('FR-14f: removing a photo preview works before submission', async ({ page }) => {
  const title = uniqueTitle('FR-14f Remove Photo')
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

  await expect(page.locator('input[type="file"][accept="image/*"]')).toBeAttached({ timeout: 10_000 })

  const fileInput = page.locator('input[type="file"][accept="image/*"]')
  await fileInput.setInputFiles(SAMPLE_JPEG)

  // Preview appears
  await expect(page.locator('img[alt="Preview 1"]')).toBeVisible({ timeout: 5_000 })

  // Click the remove (×) button on the preview
  await page.locator('button:has-text("×")').first().click()

  // Preview is gone
  await expect(page.locator('img[alt="Preview 1"]')).not.toBeVisible()
})
