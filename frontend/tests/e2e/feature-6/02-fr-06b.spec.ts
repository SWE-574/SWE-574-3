import { test, expect } from '@playwright/test'

import { loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-06b: registered user can upload one or more images for a request', async ({ page }) => {
  const title = uniqueTitle('FR-06b Need')
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

  // Fill the request form and upload two image files before submission.
  await loginAs(page, USERS.elif)
  await page.goto('/post-need')

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill('Feature 6 FR-06b validates uploaded request images on the final detail page.')
  await page.locator('input[name="duration"]').fill('1')
  await page.getByRole('button', { name: 'Online' }).click()

  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles([
    {
      name: 'need-photo-1.png',
      mimeType: 'image/png',
      buffer: firstPng,
    },
    {
      name: 'need-photo-2.png',
      mimeType: 'image/png',
      buffer: secondPng,
    },
  ])

  await expect(page.locator('img[alt="Cover photo"]').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('img[alt="Photo 2"]').first()).toBeVisible({ timeout: 10_000 })

  // Submit the request and verify both uploaded photos appear on the detail page.
  await page.getByRole('button', { name: 'Post Need' }).click()

  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('img[alt="Cover photo"]').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Photos \(2\)/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('img[alt="Photo 2"]').first()).toBeVisible({ timeout: 10_000 })
})
