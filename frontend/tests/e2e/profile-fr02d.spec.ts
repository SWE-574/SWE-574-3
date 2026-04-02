/**
 * E2E — Feature 2 / FR-02d: Public profile hides sensitive fields
 *
 * Covers implemented behavior only:
 * - public profile view should not expose account/security sections
 * - public profile API payload should not include sensitive fields
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('Public profile privacy (FR-02d)', () => {
  test('viewer cannot see sensitive fields on another user profile', async ({ page, request }) => {
    // Resolve target user id from seeded demo account (Cem)
    const loginRes = await request.post('/api/auth/login/', {
      data: { email: USERS.cem.email, password: USERS.cem.password },
    })
    expect(loginRes.ok()).toBeTruthy()

    const meRes = await request.get('/api/users/me/')
    expect(meRes.ok()).toBeTruthy()
    const cem = await meRes.json()
    const cemId = String(cem.id)

    // Login as a different user and open Cem's public profile
    await loginAs(page, USERS.elif)
    await page.goto(`/public-profile/${cemId}`)

    await expect(page.getByText(USERS.cem.name)).toBeVisible({ timeout: 25_000 })

    // Sensitive account/security sections from own-profile UI must not appear
    await expect(page.getByText('Account Information')).toHaveCount(0)
    await expect(page.getByText('Change Password')).toHaveCount(0)
    await expect(page.getByText('Settings')).toHaveCount(0)
    await expect(page.getByText(USERS.cem.email)).toHaveCount(0)

    // API contract check for sensitive fields hidden in public profile payload
    const publicRes = await page.context().request.get(`/api/users/${cemId}/`)
    expect(publicRes.ok()).toBeTruthy()
    const publicData = await publicRes.json()
    expect(publicData.email).toBeUndefined()
    expect(publicData.role).toBeUndefined()
    expect(publicData.timebank_balance).toBeUndefined()
    expect(publicData.is_verified).toBeUndefined()
    expect(publicData.is_onboarded).toBeUndefined()
  })
})
