/**
 * E2E — Feature 2 / FR-02b: Self-profile edit flow via ProfileEditDrawer
 *
 * Covers the tabbed drawer:
 * - identity tab: display name (first_name + last_name) + bio edits
 * - privacy tab: show_history toggle
 *
 * Avatar/cover crop and email change are out of scope (covered by other specs
 * once the cropper has stable Playwright handles).
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers/auth'

test.describe('Self-profile (FR-02b)', () => {
  test('user can edit display name, bio, and show_history through the edit drawer', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/profile')

    await expect(page.getByRole('button', { name: /Edit profile/i })).toBeVisible({
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

    await page.getByRole('button', { name: /Edit profile/i }).click()

    // Identity tab is the default; the inputs expose accessible labels.
    const firstNameInput = page.getByLabel('First name')
    const lastNameInput = page.getByLabel('Last name')
    const bioInput = page.getByLabel('Bio')

    await firstNameInput.fill(firstName)
    await lastNameInput.fill(lastName)
    await bioInput.fill(updatedBio)

    // Save button reflects dirty state once any field has changed.
    const saveBtn = page.getByTestId('save-changes-btn')
    await expect(saveBtn).toHaveAttribute('aria-disabled', 'false')

    // Switch to Privacy tab to flip the show_history toggle.
    await page.getByRole('tab', { name: /Privacy/i }).click()
    await page.getByText('Show exchange history on public profile').click()

    await saveBtn.click()
    await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 20_000 })

    // Updated read-mode header reflects the new display name.
    await expect(page.getByText(`${firstName} ${lastName}`).first()).toBeVisible()
    await expect(page.getByText(updatedBio).first()).toBeVisible()

    // API confirms persisted profile fields + privacy preference.
    const meAfterRes = await page.context().request.get('/api/users/me/')
    expect(meAfterRes.ok()).toBeTruthy()
    const meAfter = await meAfterRes.json()
    expect(meAfter.first_name).toBe(firstName)
    expect(meAfter.last_name).toBe(lastName)
    expect(meAfter.bio).toBe(updatedBio)
    expect(meAfter.show_history).toBe(targetShowHistory)
  })
})
