import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers'

test('FR-05d: invalid payload is rejected with clear field-level validation errors', async ({ page }) => {
  // Submit clearly invalid values so field-level validation messages appear.
  await loginAs(page, USERS.deniz)
  await page.goto('/post-offer')

  await page.locator('input[name="title"]').fill('No')
  await page.locator('textarea[name="description"]').fill('Short')
  await page.locator('input[name="duration"]').fill('0')
  await page.getByRole('button', { name: 'Post Offer' }).click()

  // The form should stay on the same page and show per-field validation feedback.
  await expect(page.getByText('Title must be at least 3 characters')).toBeVisible()
  await expect(page.getByText('Description must be at least 10 characters')).toBeVisible()
  await expect(page.getByText('Time credit must be at least 1 hour.')).toBeVisible()
  await expect(page).toHaveURL(/\/post-offer/)
})
