import { test } from '@playwright/test'
import { expectNoBlockingA11y } from '../helpers/axe'
import { loginAs, USERS } from '../helpers'

/**
 * @a11y baseline — high-traffic pages must have zero critical axe violations.
 *
 * Closes part of NFR-11c (usability / a11y for event flows) and gives us a
 * safety net for the dashboard, profile and service-detail pages every nightly
 * E2E run. When introducing new pages, add a test here.
 *
 * Why blocking-only (not full critical+serious): we are adopting axe
 * incrementally. Once these tests are green, flip to `expectNoCriticalA11y`
 * to also block on serious impact violations.
 */

test.describe('@a11y baseline', () => {
  test('@a11y home page', async ({ page }) => {
    await page.goto('/')
    await expectNoBlockingA11y(page)
  })

  test('@a11y login page', async ({ page }) => {
    await page.goto('/login')
    await expectNoBlockingA11y(page)
  })

  test('@a11y dashboard for an authenticated user', async ({ page }) => {
    await loginAs(page, USERS.regular)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await expectNoBlockingA11y(page)
  })

  test('@a11y profile page', async ({ page }) => {
    await loginAs(page, USERS.regular)
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')
    await expectNoBlockingA11y(page)
  })

  test('@a11y create offer form', async ({ page }) => {
    // The dashboard no longer hosts an in-page "Create Offer" modal — the
    // entry point now navigates to the dedicated /post-offer route. Scan the
    // form view there instead. (Was Category A drift in CI run 25603881034.)
    await loginAs(page, USERS.regular)
    await page.goto('/post-offer')
    await page.waitForLoadState('networkidle')
    await expectNoBlockingA11y(page)
  })

  test('@a11y registration page', async ({ page }) => {
    await page.goto('/register')
    await expectNoBlockingA11y(page)
  })

  test('@a11y forum topic list', async ({ page }) => {
    await loginAs(page, USERS.regular)
    await page.goto('/forum')
    await page.waitForLoadState('networkidle')
    await expectNoBlockingA11y(page)
  })

  test('@a11y search / dashboard with active query', async ({ page }) => {
    await loginAs(page, USERS.regular)
    await page.goto('/dashboard?q=tutoring')
    await page.waitForLoadState('networkidle')
    await expectNoBlockingA11y(page)
  })

  test('@a11y create event modal', async ({ page }) => {
    await loginAs(page, USERS.regular)
    await page.goto('/dashboard')
    const createEvent = page.getByRole('button', { name: /create.*event/i }).first()
    if (!(await createEvent.isVisible().catch(() => false))) {
      test.skip(true, 'No create-event entry point on this dashboard variant')
      return
    }
    await createEvent.click()
    await expectNoBlockingA11y(page, { selector: '[role="dialog"]' })
  })
})
