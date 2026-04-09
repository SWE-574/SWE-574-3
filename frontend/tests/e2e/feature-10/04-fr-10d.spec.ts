import { test, expect } from '@playwright/test'
import { loginAs, USERS } from '../helpers'

const GROUP_SERVICE_TITLE = 'Neighborhood Manti Cooking Circle'

test('FR-10d: accepted participant can access offer-level group chat thread', async ({ page }) => {
  // Zeynep is seeded as an accepted participant in this group offer.
  await loginAs(page, USERS.zeynep)
  await page.goto('/messages')

  const header = page.getByRole('button', { name: new RegExp(GROUP_SERVICE_TITLE, 'i') }).first()
  await expect(header).toBeVisible({ timeout: 20_000 })
  await expect(header.getByText('GROUP')).toBeVisible({ timeout: 10_000 })

  await header.click()
  const groupRow = page.locator('button').filter({ hasText: /members/i }).first()
  await expect(groupRow).toBeVisible({ timeout: 10_000 })
  await groupRow.click()

  await expect(page.getByPlaceholder(/Message the group/i)).toBeVisible({ timeout: 10_000 })
})
