import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { expectToast, loginAs, USERS } from './helpers/auth'
import type { DemoUser } from './helpers/auth'

function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

async function switchUser(page: Page, user: DemoUser): Promise<void> {
  await page.context().clearCookies()
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await loginAs(page, user)
}

test.describe('Owner edit locks', () => {
  test('owner can edit unlocked Offer', async ({ page }) => {
    const title = uniqueTitle('PW Offer Editable')
    const updatedTitle = `${title} Updated`

    await loginAs(page, USERS.cem)
    await page.goto('/post-offer')

    await page.locator('input[name="title"]').fill(title)
    await page.locator('textarea[name="description"]').fill('Playwright creates this offer to verify unlocked owner editing.')
    await page.locator('input[name="duration"]').fill('1.5')
    await page.getByRole('button', { name: 'Online' }).click()

    await page.getByRole('button', { name: 'Post Offer' }).click()
    await expect(page).toHaveURL(/\/service-detail\//, { timeout: 30_000 })

    await page.getByRole('button', { name: 'Edit Listing' }).click()
    await expect(page).toHaveURL(/\/edit-service\//, { timeout: 10_000 })

    await page.locator('input[name="title"]').fill(updatedTitle)
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expectToast(page, /updated successfully/i)
    await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
    await expect(page.getByText(updatedTitle).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Offer owner can still edit after interest and applicant is notified', async ({ page }) => {
    const title = uniqueTitle('PW Offer Lock After Handshake')
    const updatedTitle = `${title} Updated`

    await loginAs(page, USERS.elif)
    await page.goto('/post-offer')

    await page.locator('input[name="title"]').fill(title)
    await page.locator('textarea[name="description"]').fill('This offer is created for handshake lock verification.')
    await page.locator('input[name="duration"]').fill('1.0')
    await page.getByRole('button', { name: 'Online' }).click()

    await page.getByRole('button', { name: 'Post Offer' }).click()
    await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })
    const detailUrl = page.url()

    await switchUser(page, USERS.can)
    await page.goto(detailUrl)
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })

    const requestBtn = page.getByRole('button', { name: /Request this Service|Offer to Help/i })
    await expect(requestBtn).toBeVisible({ timeout: 10_000 })
    await requestBtn.click()
    await expectToast(page, /Interest expressed|already/i)

    await switchUser(page, USERS.elif)
    await page.goto(detailUrl)

    const editBtn = page.getByRole('button', { name: 'Edit Listing' })
    await expect(editBtn).toBeVisible({ timeout: 10_000 })
    await editBtn.click()
    await expect(page).toHaveURL(/\/edit-service\//)

    await page.locator('input[name="title"]').fill(updatedTitle)
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expectToast(page, /updated successfully/i)
    await expect(page.getByText(updatedTitle).first()).toBeVisible({ timeout: 10_000 })

    await switchUser(page, USERS.can)
    await page.goto('/notifications')
    await expect(page.getByText('Service updated').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(new RegExp(updatedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Event owner sees 24-hour edit lock for near-term events', async ({ page }) => {
    const title = uniqueTitle('PW Event Lock 24h')

    await loginAs(page, USERS.zeynep)
    await page.goto('/post-event')

    await page.locator('input[name="title"]').fill(title)
    await page.locator('textarea[name="description"]').fill('This event verifies edit lock behavior in the final 24 hours.')
    await page.locator('input[name="duration"]').fill('2')
    await page.locator('input[name="max_participants"]').fill('6')
    await page.getByRole('button', { name: 'Online' }).click()

    const start = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const year = start.getFullYear()
    const month = String(start.getMonth() + 1).padStart(2, '0')
    const day = String(start.getDate()).padStart(2, '0')
    const hours = String(start.getHours()).padStart(2, '0')
    const minutes = String(start.getMinutes()).padStart(2, '0')
    await page.locator('input[type="date"]').fill(`${year}-${month}-${day}`)
    await page.locator('input[type="time"]').fill(`${hours}:${minutes}`)

    await page.getByRole('button', { name: 'Post Event' }).click()
    await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })

    const editEventBtn = page.getByRole('button', { name: 'Edit Event' })
    await expect(editEventBtn).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Editing is locked during the final 24 hours before event start/i)).toBeVisible()

    await editEventBtn.click()
    await expect(page).not.toHaveURL(/\/edit-service\//)
  })
})
