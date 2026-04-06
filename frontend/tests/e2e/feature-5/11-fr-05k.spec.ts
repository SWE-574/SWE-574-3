import { test, expect } from '@playwright/test'
import { acceptPendingHandshakeViaApi, createOffer, extractServiceId, loginAs, openDashboardSearch, requestOfferFromDetail, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-05k: a full group offer is hidden from public discovery', async ({ page }) => {
  const title = uniqueTitle('FR-05k Group Offer')

  // Create a group offer with a finite quota.
  await loginAs(page, USERS.yasemin)
  const { detailUrl } = await createOffer(page, {
    title,
    description: 'Feature 5 FR-05k validates public discovery hiding when quota is full.',
    maxParticipants: 2,
    meetingLink: 'https://meet.example.com/fr-05k-group-offer',
  })
  const serviceId = extractServiceId(detailUrl)

  // Fill the offer by creating and accepting two participant requests.
  await switchUser(page, USERS.mehmet)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  await switchUser(page, USERS.zeynep)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  await switchUser(page, USERS.yasemin)
  await acceptPendingHandshakeViaApi(page, {
    serviceId,
    requesterName: USERS.mehmet.name,
  })
  await acceptPendingHandshakeViaApi(page, {
    serviceId,
    requesterName: USERS.zeynep.name,
  })

  // A different user should no longer find the full listing in dashboard search.
  await switchUser(page, USERS.elif)
  await openDashboardSearch(page, title)
  await expect(page.getByText(title)).toHaveCount(0)
})
