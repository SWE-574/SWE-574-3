import { test, expect } from '@playwright/test'
import { acceptPendingHandshakeViaApi, createOffer, extractServiceId, loginAs, requestOfferFromDetail, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-05i: one-to-one offers allow at most one accepted exchange at a time', async ({ page }) => {
  const title = uniqueTitle('FR-05i One To One Offer')

  // Create a one-to-one offer so a single accepted exchange should consume all availability.
  await loginAs(page, USERS.ayse)
  const { detailUrl } = await createOffer(page, {
    title,
    description: 'Feature 5 FR-05i validates single accepted exchange limit.',
    duration: 1,
  })
  const serviceId = extractServiceId(detailUrl)

  // First requester creates interest and the owner accepts it.
  await switchUser(page, USERS.deniz)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  await switchUser(page, USERS.ayse)
  await acceptPendingHandshakeViaApi(page, {
    serviceId,
    requesterName: USERS.deniz.name,
  })

  // A second requester should now see the listing as no longer open for new requests.
  await switchUser(page, USERS.zeynep)
  await page.goto(detailUrl)
  await expect(page.getByText('Service Agreed')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/No longer accepting new requests./i)).toBeVisible({ timeout: 15_000 })
})
