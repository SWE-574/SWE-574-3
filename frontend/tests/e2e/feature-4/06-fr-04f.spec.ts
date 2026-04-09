import { test, expect } from '@playwright/test'
import { loginAs, uniqueTitle, USERS, createTopicViaApi, createReplyViaApi, goToTopic, lockTopicViaApi, ADMIN } from '../helpers'

test('FR-04f: admin can lock a topic and the thread shows locked state', async ({ page }) => {
  await loginAs(page, USERS.elif)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04f Lock') })

  // Lock via API as admin.
  await loginAs(page, ADMIN)
  await lockTopicViaApi(page, topicId)

  // Navigate to the topic — should show the locked banner, reply form absent.
  await goToTopic(page, topicId)
  await expect(page.getByText(/locked/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByPlaceholder(/Write your reply/i)).toHaveCount(0)
})

test('FR-04f: locked topic rejects new replies', async ({ page }) => {
  await loginAs(page, USERS.cem)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04f Reject Reply') })

  await loginAs(page, ADMIN)
  await lockTopicViaApi(page, topicId)

  // Try posting a reply via API after lock.
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/topics/${id}/posts/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Should not be allowed.' }),
    })
    return { ok: res.ok, status: res.status }
  }, topicId)

  // Locked topics must return 403.
  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(403)
})

test('FR-04f: admin can restore a soft-deleted post', async ({ page }) => {
  // Create a reply, delete it, then restore via admin API.
  await loginAs(page, USERS.ayse)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04f Restore') })
  const postId = await createReplyViaApi(page, topicId, 'Reply to be restored.')

  // Delete the post.
  const deleted = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/posts/${id}/`, {
      method: 'DELETE',
      credentials: 'include',
    })
    return { status: res.status }
  }, postId)
  expect(deleted.status).toBe(204)

  // Restore as admin.
  await loginAs(page, ADMIN)
  const restored = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/posts/${id}/restore/`, {
      method: 'POST',
      credentials: 'include',
    })
    const data = await res.json() as { is_deleted?: boolean }
    return { ok: res.ok, isDeleted: data.is_deleted }
  }, postId)

  expect(restored.ok).toBeTruthy()
  expect(restored.isDeleted).toBe(false)
})

test('FR-04f: regular user cannot restore a deleted post', async ({ page }) => {
  await loginAs(page, USERS.mehmet)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04f No-Restore') })
  const postId = await createReplyViaApi(page, topicId, 'To be deleted, not restored by regular user.')

  // Delete as owner.
  await page.evaluate(async (id) => {
    await fetch(`/api/forum/posts/${id}/`, { method: 'DELETE', credentials: 'include' })
  }, postId)

  // Attempt restore as same regular user — must be denied.
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/posts/${id}/restore/`, {
      method: 'POST',
      credentials: 'include',
    })
    return { status: res.status }
  }, postId)

  expect(result.status).toBe(403)
})
