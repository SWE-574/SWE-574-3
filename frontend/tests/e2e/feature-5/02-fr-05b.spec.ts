import { test, expect } from '@playwright/test'
import { loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-05b: registered user can upload one or more images for an offer', async ({ page }) => {
  const title = uniqueTitle('FR-05b Offer')
  const nodeBuffer = (globalThis as unknown as {
    Buffer: { from: (input: string, encoding: 'base64') => Uint8Array }
  }).Buffer

  const firstPng = nodeBuffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn7ytcAAAAASUVORK5CYII=',
    'base64',
  )
  const secondPng = nodeBuffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAQAAADYv8WvAAAADUlEQVR42mNk+M/wHwAFAAH/e+m+7wAAAABJRU5ErkJggg==',
    'base64',
  )

  // Fill the offer form and upload two image files before submission.
  await loginAs(page, USERS.elif)
  await page.goto('/post-offer')

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill('Feature 5 FR-05b validates uploaded offer images on the final detail page.')
  await page.locator('input[name="duration"]').fill('1')
  await page.getByRole('button', { name: 'Online' }).click()

  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles([
    {
      name: 'offer-photo-1.png',
      mimeType: 'image/png',
      buffer: firstPng,
    },
    {
      name: 'offer-photo-2.png',
      mimeType: 'image/png',
      buffer: secondPng,
    },
  ])

  await expect(page.locator('img[alt="Cover photo"]').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('img[alt="Photo 2"]').first()).toBeVisible({ timeout: 10_000 })

  // Submit the offer and verify both uploaded photos appear on the detail page.
  await page.getByRole('button', { name: 'Post Offer' }).click()

  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('img[alt="Cover photo"]').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Photos \(2\)/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('img[alt="Photo 2"]').first()).toBeVisible({ timeout: 10_000 })
})
