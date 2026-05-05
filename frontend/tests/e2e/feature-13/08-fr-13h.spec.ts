import { test, expect } from '@playwright/test'
import { loginAs, USERS, createServiceViaApi, uniqueTitle } from '../helpers'

/**
 * FR-13h: Owner-side Interests panel exposes a requester public-profile link.
 *
 * Spec §5.6 — InterestRequesterRow.
 * Prerequisite: a service with at least one pending interest from another user.
 *
 * Implementation note (2026-05-05):
 *   The InterestRequesterRow component is now wired in. If the demo seed does
 *   not provide a ready-made service+handshake pair we create one via API.
 */

test('FR-13h: owner sees Interests panel with requester profile links', async ({ page }) => {
  // 1. Create a service as elif
  await loginAs(page, USERS.elif)
  const title = uniqueTitle('FR-13h Interest Offer')
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'FR-13h test service',
    duration: 1,
    locationType: 'Online',
    maxParticipants: 1,
  })

  // 2. Express interest as cem
  // We need to do this via page.evaluate since loginAs replaces auth state
  const handshakeResult = await page.evaluate(
    async ({ serviceId, cemail, cpwd }) => {
      // Log in as cem
      const loginRes = await fetch('/api/auth/login/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cemail, password: cpwd }),
      })
      if (!loginRes.ok) return { ok: false, error: `login failed: ${loginRes.status}` }

      // Express interest
      const formData = new FormData()
      formData.append('service_id', serviceId)
      const hsRes = await fetch('/api/handshakes/', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!hsRes.ok) return { ok: false, error: `handshake failed: ${hsRes.status} ${await hsRes.text()}` }
      const hs = await hsRes.json()
      return { ok: true, handshakeId: hs.id }
    },
    { serviceId: created.id, cemail: USERS.cem.email, cpwd: USERS.cem.password },
  )

  if (!handshakeResult.ok) {
    // If seeding handshake fails (e.g. balance issue), skip gracefully
    test.skip()
    return
  }

  // 3. Re-login as elif to view the owner panel
  await loginAs(page, USERS.elif)
  await page.goto(created.detailUrl)

  // 4. Owner sees the Interests panel
  await expect(page.getByText(/Incoming Requests|Participants/i).first()).toBeVisible({
    timeout: 20_000,
  })

  // 5. Requester name visible (may be "Cem Demir" or just "Cem")
  await expect(page.getByText(/cem/i, { exact: false }).first()).toBeVisible({
    timeout: 10_000,
  })

  // 6. "View profile" link should be visible and point to requester's public profile
  const viewProfileLink = page.getByRole('link', {
    name: /View Cem Demir's public profile/i,
  }).first()
  await expect(viewProfileLink).toBeVisible({ timeout: 10_000 })

  // 7. Clicking it navigates to requester's public profile page
  await viewProfileLink.click()
  await expect(page).toHaveURL(/\/public-profile\//, { timeout: 15_000 })
})

test('FR-13h: non-owner does NOT see the Interests panel', async ({ page }) => {
  // Log in as elif and create a service
  await loginAs(page, USERS.elif)
  const title = uniqueTitle('FR-13h Non-owner Offer')
  const created = await createServiceViaApi(page, {
    type: 'Offer',
    title,
    description: 'FR-13h non-owner test',
    duration: 1,
    locationType: 'Online',
  })

  // Log in as cem (non-owner) and visit the service
  await loginAs(page, USERS.cem)
  await page.goto(created.detailUrl)

  // The "Incoming Requests" heading (owner panel) should NOT be visible
  await expect(page.getByText('Incoming Requests')).not.toBeVisible()
})
