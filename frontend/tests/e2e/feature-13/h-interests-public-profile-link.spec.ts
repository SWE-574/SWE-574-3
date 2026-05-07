import { test, expect } from '@playwright/test'
import { loginAs, USERS, createServiceViaApi, uniqueTitle } from '../helpers'

/**
 * E2E spec for issue #298 — Interests panel public-profile navigation.
 *
 * Spec §8.2: owner-side InterestRequesterRow renders a public-profile link
 * for each pending requester; non-owners must NOT see the Interests panel.
 *
 * These tests require the dev server + backend running with demo data seeded
 * via `make reset && make setup-demo && make dev`.
 *
 * Where fixture seeding makes a scenario fragile the test is marked
 * `test.skip` with a clear comment, per the pattern in calendar-upcoming.spec.ts.
 */

test.describe('Interests panel — public-profile link (#298)', () => {
  /**
   * Scenario 1: Owner sees the Interests panel on a service that has at least
   * one pending requester.
   *
   * We create the service programmatically and then inject a handshake as cem
   * so the seed doesn't need to provide a ready-made pair.
   */
  test('owner sees Interests panel when there is a pending requester', async ({ page }) => {
    // Create a fresh offer as elif
    await loginAs(page, USERS.elif)
    const title = uniqueTitle('#298 Interests Panel Offer')
    const created = await createServiceViaApi(page, {
      type: 'Offer',
      title,
      description: 'Spec §8.2 scenario 1 — owner sees Interests panel.',
      duration: 1,
      locationType: 'Online',
      maxParticipants: 2,
    })

    // Express interest as cem via API (keeps elif's auth cookies after the call)
    const handshakeResult = await page.evaluate(
      async ({ serviceId, cemail, cpwd }) => {
        const loginRes = await fetch('/api/auth/login/', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cemail, password: cpwd }),
        })
        if (!loginRes.ok) return { ok: false, error: `cem login failed: ${loginRes.status}` }

        const formData = new FormData()
        formData.append('service_id', serviceId)
        const hsRes = await fetch('/api/handshakes/', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
        if (!hsRes.ok) {
          const text = await hsRes.text()
          return { ok: false, error: `handshake failed: ${hsRes.status} ${text}` }
        }
        const hs = await hsRes.json() as { id: string }
        return { ok: true, handshakeId: hs.id }
      },
      { serviceId: created.id, cemail: USERS.cem.email, cpwd: USERS.cem.password },
    )

    if (!handshakeResult.ok) {
      test.skip(
        true,
        `Could not seed a handshake for this scenario (${handshakeResult.error}). ` +
        'Interests panel rendering is covered by InterestRequesterRow.test.tsx unit tests.',
      )
      return
    }

    // Re-authenticate as elif (owner) and visit the service detail page
    await loginAs(page, USERS.elif)
    await page.goto(created.detailUrl)

    // The Interests panel heading is visible for the owner
    await expect(
      page.getByText(/Incoming Requests|Participants/i).first(),
    ).toBeVisible({ timeout: 20_000 })

    // The requester's name (Cem Demir) is listed in the panel
    await expect(
      page.getByText(/Cem Demir|cem/i, { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  /**
   * Scenario 2: Clicking the avatar+name link navigates to
   * `/public-profile/{requesterId}`.
   *
   * In the refactored component, the avatar and name are wrapped in a single
   * <Link> whose aria-label is "View {name}'s public profile".
   */
  test('clicking avatar+name link navigates to /public-profile/{requesterId}', async ({ page }) => {
    await loginAs(page, USERS.elif)
    const title = uniqueTitle('#298 Avatar Link Offer')
    const created = await createServiceViaApi(page, {
      type: 'Offer',
      title,
      description: 'Spec §8.2 scenario 2 — avatar link navigates to public profile.',
      duration: 1,
      locationType: 'Online',
      maxParticipants: 2,
    })

    const handshakeResult = await page.evaluate(
      async ({ serviceId, cemail, cpwd }) => {
        const loginRes = await fetch('/api/auth/login/', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cemail, password: cpwd }),
        })
        if (!loginRes.ok) return { ok: false, error: `cem login failed: ${loginRes.status}` }

        const formData = new FormData()
        formData.append('service_id', serviceId)
        const hsRes = await fetch('/api/handshakes/', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
        if (!hsRes.ok) {
          return { ok: false, error: `handshake failed: ${hsRes.status}` }
        }
        return { ok: true }
      },
      { serviceId: created.id, cemail: USERS.cem.email, cpwd: USERS.cem.password },
    )

    if (!handshakeResult.ok) {
      test.skip(
        true,
        'Could not seed handshake — avatar-link navigation test skipped. ' +
        'Covered by InterestRequesterRow.test.tsx unit tests.',
      )
      return
    }

    await loginAs(page, USERS.elif)
    await page.goto(created.detailUrl)

    // Wait for the Interests panel
    await expect(
      page.getByText(/Incoming Requests|Participants/i).first(),
    ).toBeVisible({ timeout: 20_000 })

    // The single <Link> wrapping avatar+name has aria-label "View Cem Demir's public profile"
    // After the Deviation A fix the avatar and name share ONE link element.
    const avatarNameLink = page
      .getByRole('link', { name: /View Cem Demir's public profile/i })
      .first()
    await expect(avatarNameLink).toBeVisible({ timeout: 10_000 })
    await avatarNameLink.click()

    await expect(page).toHaveURL(/\/public-profile\//, { timeout: 15_000 })
  })

  /**
   * Scenario 3: Clicking the explicit [View profile] button navigates to the
   * same `/public-profile/{requesterId}` URL.
   *
   * The [View profile] button is the separate explicit button on the right side
   * of the row (distinct from the avatar+name link — spec §5.6).
   */
  test('clicking [View profile] button navigates to /public-profile/{requesterId}', async ({ page }) => {
    await loginAs(page, USERS.elif)
    const title = uniqueTitle('#298 ViewProfile Button Offer')
    const created = await createServiceViaApi(page, {
      type: 'Offer',
      title,
      description: 'Spec §8.2 scenario 3 — View profile button.',
      duration: 1,
      locationType: 'Online',
      maxParticipants: 2,
    })

    const handshakeResult = await page.evaluate(
      async ({ serviceId, cemail, cpwd }) => {
        const loginRes = await fetch('/api/auth/login/', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cemail, password: cpwd }),
        })
        if (!loginRes.ok) return { ok: false, error: `cem login: ${loginRes.status}` }

        const formData = new FormData()
        formData.append('service_id', serviceId)
        const hsRes = await fetch('/api/handshakes/', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
        if (!hsRes.ok) return { ok: false, error: `handshake: ${hsRes.status}` }
        return { ok: true }
      },
      { serviceId: created.id, cemail: USERS.cem.email, cpwd: USERS.cem.password },
    )

    if (!handshakeResult.ok) {
      test.skip(
        true,
        'Could not seed handshake — View profile button test skipped. ' +
        'Covered by InterestRequesterRow.test.tsx unit tests.',
      )
      return
    }

    await loginAs(page, USERS.elif)
    await page.goto(created.detailUrl)

    await expect(
      page.getByText(/Incoming Requests|Participants/i).first(),
    ).toBeVisible({ timeout: 20_000 })

    // The explicit "View profile" link/button in the row's right action group
    const viewProfileBtn = page
      .getByRole('link', { name: /View profile/i })
      .last()   // The row-right button, NOT the aria-label wrapper
    await expect(viewProfileBtn).toBeVisible({ timeout: 10_000 })
    await viewProfileBtn.click()

    await expect(page).toHaveURL(/\/public-profile\//, { timeout: 15_000 })
  })

  /**
   * Scenario 4: Non-owner viewing the same service does NOT see the Interests
   * panel.
   *
   * This scenario is runnable against demo data — any fresh service whose
   * owner is elif is enough, no handshake seeding required.
   */
  test('non-owner does NOT see the Interests panel', async ({ page }) => {
    // Create a service as elif (owner)
    await loginAs(page, USERS.elif)
    const title = uniqueTitle('#298 Non-owner Check')
    const created = await createServiceViaApi(page, {
      type: 'Offer',
      title,
      description: 'Spec §8.2 scenario 4 — non-owner visibility check.',
      duration: 1,
      locationType: 'Online',
    })

    // Log in as cem (a different user — non-owner) and visit the service
    await loginAs(page, USERS.cem)
    await page.goto(created.detailUrl)

    // Service title should be visible (page loaded successfully)
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 })

    // The "Incoming Requests" / Interests panel heading must NOT be visible to non-owners
    await expect(page.getByText('Incoming Requests')).not.toBeVisible()
  })
})
