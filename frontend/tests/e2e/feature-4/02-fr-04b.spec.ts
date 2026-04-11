import { test, expect } from '@playwright/test'
import { loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-04b: authenticated user can create a forum topic with title and body', async ({ page }) => {
  const title = uniqueTitle('FR-04b Topic')
  const body  = 'This is the body written by Playwright for the FR-04b creation test. It is long enough.'

  // Open the create-topic form.
  await loginAs(page, USERS.mehmet)
  await page.goto('/forum/new')

  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('textarea[name="body"]')).toBeVisible()
  await expect(page.locator('select')).toBeVisible()

  // Fill in the form and submit.
  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="body"]').fill(body)
  await page.getByRole('button', { name: /create topic/i }).click()

  // Successful creation navigates to the topic detail page.
  await expect(page).toHaveURL(/\/forum\/topic\//, { timeout: 20_000 })

  // The topic title is visible on the detail page.
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
})

test('FR-04b: topic creation form validates minimum title length', async ({ page }) => {
  // The form schema requires a title of at least 5 characters.
  await loginAs(page, USERS.zeynep)
  await page.goto('/forum/new')

  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('input[name="title"]').fill('Hi')
  await page.locator('textarea[name="body"]').fill(
    'This body is long enough to pass validation on its own.',
  )
  await page.getByRole('button', { name: /create topic/i }).click()

  // The page should not navigate away — form stays open with a validation message.
  await expect(page).not.toHaveURL(/\/forum\/topic\//, { timeout: 5_000 })
})
