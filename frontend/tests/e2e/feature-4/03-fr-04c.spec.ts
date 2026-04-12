import { test, expect } from '@playwright/test'
import { loginAs, switchUser, uniqueTitle, USERS, createTopicViaApi, goToTopic } from '../helpers'

test('FR-04c: authenticated user can add a reply to a forum topic', async ({ page }) => {
  // Create a topic as one user, then reply as a different user.
  await loginAs(page, USERS.elif)
  const topicTitle = uniqueTitle('FR-04c Topic')
  const topicId = await createTopicViaApi(page, { title: topicTitle })

  // Switch to another user and navigate to the topic.
  await switchUser(page, USERS.cem)
  await goToTopic(page, topicId)

  // The reply form should be visible for authenticated users.
  await expect(page.getByPlaceholder(/Write your reply/i)).toBeVisible({ timeout: 10_000 })

  // Type a reply and submit.
  const replyText = uniqueTitle('FR-04c Reply')
  await page.getByPlaceholder(/Write your reply/i).fill(replyText)
  await page.getByRole('button', { name: 'Post Reply' }).click()

  // The reply should appear in the thread.
  await expect(page.getByText(replyText).first()).toBeVisible({ timeout: 10_000 })
})

test('FR-04c: reply count increments after a reply is posted', async ({ page }) => {
  // Create topic and note initial reply count (0).
  await loginAs(page, USERS.ayse)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04c Count') })

  await goToTopic(page, topicId)
  await expect(page.getByText('0 replies').first()).toBeVisible({ timeout: 10_000 })

  // Post a reply.
  await page.getByPlaceholder(/Write your reply/i).fill('A reply to increment the count.')
  await page.getByRole('button', { name: 'Post Reply' }).click()

  // Reply count should update to 1 (posts section uses singular: "1 reply").
  await expect(page.getByText('1 reply').first()).toBeVisible({ timeout: 10_000 })
})
