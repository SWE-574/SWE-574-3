import { test, expect } from '@playwright/test'
import { createOffer, loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-05c: registered user can configure a group offer with quota greater than one', async ({ page }) => {
  const title = uniqueTitle('FR-05c Group Offer')

  // Create an offer with a participant quota greater than one.
  await loginAs(page, USERS.ayse)
  await createOffer(page, {
    title,
    description: 'Feature 5 FR-05c validates group offer capacity setup.',
    maxParticipants: 3,
    meetingLink: 'https://meet.example.com/fr-05c-group-offer',
  })

  // The detail page should reflect both the listing title and the configured group capacity.
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/0\/3 filled/i)).toBeVisible()
})
