/**
 * E2E — Feature 2 / FR-02a: Self-profile view displays core fields
 *
 * Covers implemented UI only (no forum statistics).
 * Requires seeded demo data (setup_demo.py) so Elif has bio + avatar_url.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('Self-profile (FR-02a)', () => {
  test('shows display name, avatar, join year, and bio for seeded demo user', async ({
    page,
  }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    // Wait until profile chrome is ready (not spinner-only)
    await expect(page.getByRole('button', { name: /Edit Profile/i })).toBeVisible({
      timeout: 25_000,
    })

    // Resolve current user profile dynamically so test is resilient to prior edits.
    const meRes = await page.context().request.get('/api/users/me/')
    expect(meRes.ok()).toBeTruthy()
    const me = await meRes.json()
    const displayName = `${me.first_name || ''} ${me.last_name || ''}`.trim() || String(me.email || '')

    await expect(page.getByText(displayName)).toBeVisible()

    // Avatar: if avatar_url exists, profile header should render image with alt=displayName.
    if (me.avatar_url) {
      await expect(page.getByRole('img', { name: displayName }).first()).toBeVisible()
    }

    // Join date in profile hero is rendered as a "Member since" stat tile
    // with a "Mon YYYY" value (e.g. "May 2026"). Assert the label is visible
    // and that *some* stat tile shows a month-year value.
    await expect(page.getByText('Member since').first()).toBeVisible()
    await expect(
      page.getByText(/^[A-Z][a-z]{2,8} \d{4}$/).first(),
    ).toBeVisible()

    // Bio is rendered inline in the hero (no "About" section header on the
    // own-profile view) when present.
    if (me.bio) {
      await expect(page.getByText(String(me.bio)).first()).toBeVisible()
    }
  })
})
