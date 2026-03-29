/**
 * E2E — Feature 2 / FR-02b: Self-profile edit flow
 *
 * Covers implemented behavior only:
 * - display name edit (first_name + last_name)
 * - bio edit
 * - avatar edit via crop modal
 * - supported contact preference: show_history toggle
 *
 * Does NOT cover email change (not implemented) or forum stats.
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

function tinyPngFile() {
  // 1x1 transparent PNG
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8x7YAAAAASUVORK5CYII='
  const NodeBuffer = (globalThis as unknown as { Buffer: { from: (input: string, encoding: string) => unknown } }).Buffer
  return {
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: NodeBuffer.from(base64, 'base64') as any,
  }
}

test.describe('Self-profile (FR-02b)', () => {
  test('user can edit display name, bio, avatar and show_history preference', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    await expect(page.getByRole('button', { name: /Edit Profile/i })).toBeVisible({
      timeout: 25_000,
    })

    const meBeforeRes = await page.context().request.get('/api/users/me/')
    expect(meBeforeRes.ok()).toBeTruthy()
    const meBefore = await meBeforeRes.json()
    const targetShowHistory = !(meBefore.show_history ?? false)

    const stamp = Date.now().toString().slice(-6)
    const firstName = `Elif${stamp}`
    const lastName = `FR02b${stamp}`
    const updatedBio = `FR-02b bio update ${stamp}`

    const avatarImg = page.getByRole('img', { name: /Elif/i }).first()
    await expect(avatarImg).toBeVisible()
    const oldAvatarSrc = await avatarImg.getAttribute('src')

    await page.getByRole('button', { name: 'Edit Profile' }).click()

    const firstNameInput = page.locator('text=First name').locator('xpath=following::input[1]')
    const lastNameInput = page.locator('text=Last name').locator('xpath=following::input[1]')
    const bioInput = page.getByPlaceholder('Tell others about yourself…')

    await firstNameInput.fill(firstName)
    await lastNameInput.fill(lastName)
    await bioInput.fill(updatedBio)

    // Toggle supported contact preference (show_history)
    await page.getByText('Show my exchange history on public profile').click()

    // Trigger avatar edit and apply crop
    await page.locator('input[type="file"]').first().setInputFiles(tinyPngFile())
    await expect(page.getByText('Crop Profile Photo')).toBeVisible()
    await page.getByRole('button', { name: /Apply Crop/i }).click()

    // Avatar preview should now be a local cropped data URL
    // In edit mode, profile header still renders displayName from current user state
    // until Save updates the backend/user store.
    const previewAvatar = page.getByRole('img', { name: /Elif Yılmaz/i }).first()
    await expect(previewAvatar).toBeVisible()
    await expect(previewAvatar).toHaveAttribute('src', /data:image\/jpeg/)

    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 20_000 })

    // Updated read-mode UI checks
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible()
    await expect(page.getByText('About')).toBeVisible()
    await expect(page.getByText(updatedBio)).toBeVisible()

    // API confirms persisted profile fields + supported contact preference
    const meAfterRes = await page.context().request.get('/api/users/me/')
    expect(meAfterRes.ok()).toBeTruthy()
    const meAfter = await meAfterRes.json()
    expect(meAfter.first_name).toBe(firstName)
    expect(meAfter.last_name).toBe(lastName)
    expect(meAfter.bio).toBe(updatedBio)
    expect(meAfter.show_history).toBe(targetShowHistory)
    expect(String(meAfter.avatar_url || '')).not.toBe(String(oldAvatarSrc || ''))
  })
})
