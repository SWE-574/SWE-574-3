/**
 * E2E — Feature 2 / FR-02c: Profile inputs are validated before persist
 *
 * Covers implemented UI/backend behavior only:
 * - invalid profile payload (bio > 1000) returns validation error
 * - invalid update is not persisted
 */

import { test, expect } from '@playwright/test'
import { expectToast, loginAs, USERS } from './helpers/auth'

test.describe('Self-profile (FR-02c)', () => {
  test('rejects overlong bio and keeps stored profile unchanged', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    await expect(page.getByRole('button', { name: /Edit Profile/i })).toBeVisible({
      timeout: 25_000,
    })

    const meBeforeRes = await page.context().request.get('/api/users/me/')
    expect(meBeforeRes.ok()).toBeTruthy()
    const meBefore = await meBeforeRes.json()
    const bioBefore = String(meBefore.bio || '')

    await page.getByRole('button', { name: 'Edit Profile' }).click()

    const bioInput = page.getByPlaceholder('Tell others about yourself…')
    await bioInput.fill('x'.repeat(1001))

    await page.getByRole('button', { name: 'Save' }).click()

    await expectToast(page, /Validation failed|1000 characters/i)
    await expect(page.getByText('Profile updated')).toHaveCount(0)

    const meAfterRes = await page.context().request.get('/api/users/me/')
    expect(meAfterRes.ok()).toBeTruthy()
    const meAfter = await meAfterRes.json()
    expect(String(meAfter.bio || '')).toBe(bioBefore)
  })
})
