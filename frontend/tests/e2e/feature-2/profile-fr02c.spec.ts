/**
 * E2E — Feature 2 / FR-02c: ProfileEditDrawer hard-caps bio at 280 characters
 *
 * The drawer now enforces a 280-char cap at the source (slice on every change)
 * so the backend's 1000-char serializer ceiling can never be reached from the
 * UI. This spec verifies the client cap holds and that the saved profile only
 * stores the truncated value.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('Self-profile (FR-02c)', () => {
  test('bio textarea hard-caps at 280 characters and persists the truncated value', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    await expect(page.getByRole('button', { name: /Edit profile/i })).toBeVisible({
      timeout: 25_000,
    })

    await page.getByRole('button', { name: /Edit profile/i }).click()

    const bioInput = page.getByLabel('Bio')
    const stamp = Date.now().toString().slice(-6)
    const longBio = `FR02c-${stamp}-` + 'x'.repeat(1100)

    await bioInput.fill(longBio)

    // The drawer truncates input on the way in; the textarea reads back at
    // most 280 characters regardless of the upstream paste size.
    const storedValue = await bioInput.inputValue()
    expect(storedValue.length).toBe(280)
    expect(storedValue.startsWith(`FR02c-${stamp}-`)).toBeTruthy()

    await page.getByTestId('save-changes-btn').click()
    await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 20_000 })

    // Backend persists exactly the truncated value — proves the client cap is
    // the effective ceiling and the 1000-char path is unreachable from the UI.
    const meAfterRes = await page.context().request.get('/api/users/me/')
    expect(meAfterRes.ok()).toBeTruthy()
    const meAfter = await meAfterRes.json()
    expect(String(meAfter.bio || '')).toBe(storedValue)
  })
})
