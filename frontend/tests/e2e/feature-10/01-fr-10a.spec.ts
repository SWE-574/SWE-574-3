import { test, expect } from '@playwright/test'
import { loginAs, expectToast, openServiceFromDashboard, USERS } from '../helpers'

const TARGET_SERVICE = 'Watercolor Postcards for the Community Board'

test('FR-10a: pending exchange opens a private requester-provider chat thread', async ({ page }) => {
  // Create or reuse the requester-provider relationship from the service detail.
  await loginAs(page, USERS.can)
  // Use the dashboard search rather than scrolling — the seed item is not
  // guaranteed to be on the first page of curated cards.
  await openServiceFromDashboard(page, TARGET_SERVICE)

  const requestButton = page.getByRole('button', { name: /Request this Service|Offer to Help/i })
  const viewChatButton = page.getByRole('button', { name: /View Chat/i })
  await expect(requestButton.or(viewChatButton)).toBeVisible({ timeout: 10_000 })

  if (await requestButton.isVisible()) {
    await requestButton.click()
    await expectToast(page, /Interest expressed|already/i)
  }

  // Verify a private chat row is available under Messages.
  await page.goto('/messages')
  await expect(
    page.locator('button').filter({ hasText: /Watercolor|Ayşe|Community Board/i }).first(),
  ).toBeVisible({ timeout: 20_000 })
})
