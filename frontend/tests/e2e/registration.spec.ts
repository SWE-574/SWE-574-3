/**
 * E2E — Registration
 *
 * Covers: /register form, validation, success redirect, Sign in link.
 */

import { test, expect } from '@playwright/test'

test.describe('Registration', () => {
  test('/register page loads with form fields', async ({ page }) => {
    await page.goto('/register')

    await expect(page.getByLabel('First name')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Last name')).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('#confirmPassword')).toBeVisible()
  })

  test('required field validation blocks submit or shows error', async ({ page }) => {
    await page.goto('/register')

    const createBtn = page.getByRole('button', { name: 'Create Account' })
    await expect(createBtn).toBeVisible()
    await expect(createBtn).toBeDisabled()
    await expect(page).toHaveURL(/\/register/)
  })

  test('valid registration redirects to verify-email-sent or dashboard', async ({ page }) => {
    await page.goto('/register')

    const unique = `e2e-reg-${Date.now()}@example.com`
    await page.getByLabel('First name').fill('E2E')
    await page.getByLabel('Last name').fill('Reg')
    await page.getByLabel('Email address').fill(unique)
    await page.locator('#password').fill('Str0ngPass!123')
    await page.locator('#confirmPassword').fill('Str0ngPass!123')
    await page.getByLabel(/I agree to the Terms/i).click()
    await page.getByRole('button', { name: 'Create Account' }).click()

    await expect(page).toHaveURL(/\/(verify-email-sent|dashboard)/, { timeout: 25_000 })
  })

  test('Sign in link goes to /login', async ({ page }) => {
    await page.goto('/register')

    await page.getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
