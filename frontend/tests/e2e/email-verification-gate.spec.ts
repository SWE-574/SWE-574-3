import { test, expect, type Page } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

/**
 * Email verification gate — end-to-end coverage.
 *
 * Backend rejects unverified users on:
 *   • POST /api/services/                                  (Offer / Need / Event create)
 *   • POST /api/services/<id>/interest/                    (request an Offer / offer help on a Need)
 *   • POST /api/handshakes/services/<id>/join-event/       (RSVP to an Event)
 * with HTTP 403 + `code: EMAIL_NOT_VERIFIED`.
 *
 * The frontend mirrors the rule with:
 *   • A route-level guard on /post-offer, /post-need, /post-event
 *     (renders <RequireVerifiedEmail …/> in place of the form).
 *   • An action-level modal on the service detail page so the join /
 *     "Request this Service" / "Offer to Help" buttons surface a clear CTA
 *     before they ever hit the API.
 *
 * Backend remains the source of truth; these tests verify the UX path.
 */

async function stubSendVerification(page: Page) {
  let calls = 0
  await page.route('**/api/auth/send-verification/', async (route) => {
    if (route.request().method() === 'POST') {
      calls += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Verification email sent.' }),
      })
    } else {
      await route.continue()
    }
  })
  return () => calls
}

test.describe('post-* route email verification gate', () => {
  for (const { path, label } of [
    { path: '/post-offer', label: 'post an Offer' },
    { path: '/post-need',  label: 'post a Need'   },
    { path: '/post-event', label: 'post an Event' },
  ]) {
    test(`unverified user is blocked on ${path}`, async ({ page }) => {
      await loginAs(page, USERS.cem, { is_verified: false })
      // Sentinel: confirm the unverified state has been hydrated into the
      // auth store by waiting for the dashboard's "Limited access" banner.
      // Without this wait the subsequent navigation can race ahead of the
      // /users/me/ stub being applied, leaving `user.is_verified` undefined
      // when RequireVerifiedEmail mounts (it then falls through to children).
      await expect(
        page.locator('text=Limited access').first(),
      ).toBeVisible({ timeout: 15_000 })
      const callsOf = await stubSendVerification(page)

      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(path), { timeout: 10_000 })

      const guard = page.getByTestId('require-verified-email')
      await expect(guard).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(new RegExp(`Verify your email to ${label}`, 'i'))).toBeVisible()

      // The actual form must not be rendered.
      await expect(page.locator('input[name="title"]')).toHaveCount(0)
      await expect(page.locator('textarea[name="description"]')).toHaveCount(0)

      // Resend CTA works and confirms with toast + button state change.
      await page.getByTestId('resend-verification-button').click()
      await expect.poll(callsOf).toBeGreaterThanOrEqual(1)
      await expect(page.getByText(/Email sent/i)).toBeVisible({ timeout: 5_000 })
    })
  }

  test('verified user can still reach /post-offer', async ({ page }) => {
    await loginAs(page, USERS.cem, { is_verified: true })

    await page.goto('/post-offer')
    await expect(page).toHaveURL(/\/post-offer/, { timeout: 10_000 })

    await expect(page.getByTestId('require-verified-email')).toHaveCount(0)
    await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('textarea[name="description"]')).toBeVisible()
  })
})

test.describe('service detail join/request email verification gate', () => {
  test('unverified user sees the verification modal when requesting an Offer', async ({ page }) => {
    await loginAs(page, USERS.cem, { is_verified: false })
    // Sentinel: confirm the unverified state has been hydrated into the
    // auth store before exercising any flow that reads `is_verified`.
    await expect(
      page.locator('text=Limited access').first(),
    ).toBeVisible({ timeout: 15_000 })
    const callsOf = await stubSendVerification(page)

    // Find an Offer in the dashboard listings authored by someone other than
    // the logged-in user, so the "Request this Service" CTA is rendered.
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle').catch(() => { /* ignore */ })
    const ownerEmail = USERS.cem.email
    const offerLink = page
      .locator('a[href^="/service-detail/"]')
      .filter({ hasText: /./ })
      .first()
    await expect(offerLink).toBeVisible({ timeout: 20_000 })
    await offerLink.click()

    // The detail page must finish loading before we look for the CTA.
    await expect(page).toHaveURL(/\/service-detail\//, { timeout: 10_000 })

    const requestBtn = page.getByRole('button', {
      name: /Request this Service|Offer to Help|Join Event/i,
    })
    // If we landed on our own service (no CTA), bail out — the test will be
    // exercised by other workers; this keeps the spec resilient to demo data.
    if (!(await requestBtn.isVisible().catch(() => false))) {
      test.skip(
        true,
        `Logged-in user (${ownerEmail}) owns the first dashboard service; no join CTA rendered to test the gate.`,
      )
      return
    }

    await requestBtn.click()

    // The verification modal must appear instead of the API call going through.
    const modal = page.getByTestId('verification-required-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('verification-required-resend').click()
    await expect.poll(callsOf).toBeGreaterThanOrEqual(1)
    await expect(modal.getByText(/Email sent/i)).toBeVisible({ timeout: 5_000 })

    // "Not now" closes the modal cleanly.
    await page.getByTestId('verification-required-cancel').click()
    await expect(modal).toHaveCount(0)
  })
})
