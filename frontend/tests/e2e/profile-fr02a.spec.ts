/**
 * E2E — Feature 2 / FR-02a: Self-profile view displays core fields
 *
 * Covers implemented UI only (no forum statistics).
 * Requires seeded demo data (setup_demo.py) so Elif has bio + avatar_url.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

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

    // Display name: first_name + last_name (seeded Elif Yılmaz)
    await expect(page.getByText('Elif Yılmaz')).toBeVisible()

    // Avatar: seeded user has avatar_url → <img alt={displayName}>
    await expect(page.getByRole('img', { name: 'Elif Yılmaz' })).toBeVisible()

    // Join date in header: "Joined {year}" (year depends on seed date_joined vs today)
    await expect(page.getByText(/^Joined \d{4}$/)).toBeVisible()

    // Bio (read mode): About section + seeded copy from setup_demo.py
    await expect(page.getByText('About')).toBeVisible()
    await expect(
      page.getByText(
        /Freelance designer and cooking enthusiast living in Beşiktaş/i,
      ),
    ).toBeVisible()
  })
})
