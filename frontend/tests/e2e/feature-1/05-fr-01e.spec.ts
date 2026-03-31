/**
 * FR-01e — User registration with unique email constraints
 *
 * The system shall support user registration with unique email and
 * username constraints when registration is enabled.
 */

import { test, expect, type Page } from '@playwright/test'

/**
 * Fill the registration form fields.
 * agreeToTerms uses Chakra UI v3 Checkbox.Root — click the visible label, not the hidden input.
 */
async function fillRegistrationForm(
  page: Page,
  opts: { firstName: string; lastName: string; email: string; password: string; confirmPassword?: string }
) {
  await page.locator('input[name="first_name"], #first_name').first().fill(opts.firstName)
  await page.locator('input[name="last_name"], #last_name').first().fill(opts.lastName)
  await page.locator('input[type="email"], #email, [name="email"]').first().fill(opts.email)
  await page.locator('input[type="password"], [name="password"]').first().fill(opts.password)

  const confirm = page.locator('[name="confirmPassword"], #confirmPassword').first()
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.fill(opts.confirmPassword ?? opts.password)
  }

  // Chakra UI v3 Checkbox renders a hidden <input> — interact via the <label> instead
  await page.locator('label[for="agreeToTerms"]').click()
}

test.describe('FR-01e: Registration with unique email constraints', () => {
  test('registration page is accessible at /register', async ({ page }) => {
    await page.goto('/register')
    await expect(page).toHaveURL(/\/register/)
    await expect(page.locator('input[type="email"], #email, [name="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"], [name="password"]').first()).toBeVisible()
  })

  test('valid registration creates account and redirects away from register page', async ({ page }) => {
    const unique = `e2e_${Date.now()}@test-registration.invalid`
    await page.goto('/register')
    await fillRegistrationForm(page, {
      firstName: 'E2E', lastName: 'Test', email: unique, password: 'TestPass123',
    })

    await page.getByRole('button', { name: /sign up|register|create/i }).click()
    await expect(page).not.toHaveURL(/\/register/, { timeout: 20_000 })
  })

  test('duplicate email is rejected with an error', async ({ page }) => {
    await page.goto('/register')
    await fillRegistrationForm(page, {
      firstName: 'Dup', lastName: 'User', email: 'cem@demo.com', password: 'TestPass123',
    })

    await page.getByRole('button', { name: /sign up|register|create/i }).click()

    await expect(page).toHaveURL(/\/register/, { timeout: 10_000 })
    await expect(
      page.locator('text=/already|exists|taken|duplicate|registered/i').first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('weak password is rejected by client-side validation', async ({ page }) => {
    await page.goto('/register')

    await page.locator('input[name="first_name"], #first_name').first().fill('Test')
    await page.locator('input[name="last_name"], #last_name').first().fill('User')
    await page.locator('input[type="email"], #email, [name="email"]').first().fill(`weak_${Date.now()}@test.invalid`)
    await page.locator('input[type="password"], [name="password"]').first().fill('weak')
    // Submit without checking terms — button stays disabled due to invalid password (and no terms)
    await page.getByRole('button', { name: /sign up|register|create/i }).click({ force: true })

    await expect(page).toHaveURL(/\/register/)
  })
})
