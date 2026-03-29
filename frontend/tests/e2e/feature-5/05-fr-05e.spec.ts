import { test, expect, type Page } from '@playwright/test'
import { acceptPendingHandshakeViaApi, extractServiceId, futureDateParts, loginAs, requestOfferFromDetail, switchUser, uniqueTitle, USERS } from '../helpers'

async function selectLocationResult(page: Page, placeholder: string | RegExp, query: string) {
  const input = page.getByPlaceholder(placeholder).first()
  await input.fill(query)

  const inputParent = input.locator('xpath=ancestor::div[1]')
  const dropdown = inputParent.locator('xpath=following-sibling::div[1]')
  await expect(dropdown).toBeVisible({ timeout: 30_000 })
  const firstResultRow = dropdown.locator('xpath=./div[p][1]')
  await expect(firstResultRow).toBeVisible({ timeout: 30_000 })
  // `LocationSearch` renders its results in a sibling container next to the input wrapper,
  // and the selection is committed from the result row's `onMouseDown`.
  await firstResultRow.dispatchEvent('mousedown')
}

test('FR-05e: group offer owner sees edit lock once an approved exchange is active', async ({ page }) => {
  const title = uniqueTitle('FR-05e Group Offer')

  await loginAs(page, USERS.elif)
  await page.goto('/post-offer')

  // Create a fixed in-person group offer so we can move one participant into approved state.
  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill('Feature 5 FR-05e initial description for editable group offer.')
  await page.locator('input[name="duration"]').fill('1')
  await page.locator('input[name="max_participants"]').fill('3')
  await page.getByRole('button', { name: 'In-Person' }).click()

  await selectLocationResult(page, /Search address/i, 'Kadıköy')


  const { date, time } = futureDateParts(2)
  await page.locator('input[type="date"]').fill(date)
  await page.locator('input[type="time"]').fill(time)
  await page.getByRole('button', { name: 'Post Offer' }).click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })

  const detailUrl = page.url()
  const serviceId = extractServiceId(detailUrl)

  // A second user creates an incoming exchange on the offer.
  await switchUser(page, USERS.mehmet)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  // This test covers the current product behavior for group offers: once an incoming
  // exchange becomes approved/accepted, the owner still sees the edit button but the
  // page keeps editing locked and shows the lock reason instead of navigating away.
  await switchUser(page, USERS.elif)
  await acceptPendingHandshakeViaApi(page, {
    serviceId,
    requesterName: USERS.mehmet.name,
  })

  // The owner should remain on detail page and see the edit lock instead of the edit form.
  await page.goto(detailUrl)
  const editButton = page.getByRole('button', { name: 'Edit Listing' })
  await expect(editButton).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Editing is locked while an approved session is still active\./i)).toBeVisible({
    timeout: 10_000,
  })

  await editButton.click()
  await expect(page).toHaveURL(new RegExp(`/service-detail/${serviceId}`), { timeout: 10_000 })
})
