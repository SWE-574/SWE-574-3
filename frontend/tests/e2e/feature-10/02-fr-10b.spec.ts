import { test, expect } from '@playwright/test'
import { loginAs, expectToast, openServiceFromDashboard, USERS } from '../helpers'

const TARGET_SERVICE = 'Watercolor Postcards for the Community Board'

test('FR-10b: opening message is auto-created when private thread starts', async ({ page }) => {
  // Ensure the private thread exists first.
  await loginAs(page, USERS.can)
  // Use the dashboard search rather than scrolling — the seed item is not
  // guaranteed to be on the first page of curated cards.
  await openServiceFromDashboard(page, TARGET_SERVICE)

  const requestButton = page.getByRole('button', { name: /Request this Service|Offer to Help/i })
  if (await requestButton.isVisible()) {
    await requestButton.click()
    await expectToast(page, /Interest expressed|already/i)
  }

  // Open the related conversation and validate the auto opening message.
  await page.goto('/messages')
  const conversationRow = page.locator('button').filter({ hasText: /Watercolor|Ayşe|Community Board/i }).first()
  await expect(conversationRow).toBeVisible({ timeout: 20_000 })
  await conversationRow.click()

  await expect(page.getByText(/interested in your service/i).first()).toBeVisible({ timeout: 10_000 })
})
