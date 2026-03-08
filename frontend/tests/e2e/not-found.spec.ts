/**
 * E2E — Not Found (404)
 *
 * Covers: unknown path shows 404 page with Go to Home / Browse Services.
 */

import { test, expect } from '@playwright/test'

test.describe('Not Found', () => {
  test('unknown path shows 404 with Go to Home or Browse Services', async ({ page }) => {
    await page.goto('/xyznonexistent')

    await expect(
      page.getByText(/Page Not Found|404|not found/i).first(),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByText(/Go to Home|Browse Services/i).first(),
    ).toBeVisible({ timeout: 5_000 })
  })
})
