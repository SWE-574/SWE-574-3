import { test, expect } from '@playwright/test'
import { acceptPendingHandshakeViaApi, createOffer, extractServiceId, loginAs, requestOfferFromDetail, switchUser, uniqueTitle, USERS } from '../helpers'

test('FR-05j: group offers allow accepted exchanges up to the configured quota', async ({ page }) => {
  const title = uniqueTitle('FR-05j Group Offer')

  // Create a group offer with quota two.
  await loginAs(page, USERS.yasemin)
  const { detailUrl } = await createOffer(page, {
    title,
    description: 'Feature 5 FR-05j validates accepted capacity up to quota.',
    maxParticipants: 2,
    meetingLink: 'https://meet.example.com/fr-05j-group-offer',
  })
  const serviceId = extractServiceId(detailUrl)

  // Two different users request the same group offer.
  await switchUser(page, USERS.mehmet)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  await switchUser(page, USERS.zeynep)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  // Owner accepts both requests and the UI should show the quota as filled.
  await switchUser(page, USERS.yasemin)
  await acceptPendingHandshakeViaApi(page, {
    serviceId,
    requesterName: USERS.mehmet.name,
  })
  await acceptPendingHandshakeViaApi(page, {
    serviceId,
    requesterName: USERS.zeynep.name,
  })

  await page.goto(detailUrl)
  await expect(page.getByText(/2\/2 filled/i)).toBeVisible({ timeout: 15_000 })
})
