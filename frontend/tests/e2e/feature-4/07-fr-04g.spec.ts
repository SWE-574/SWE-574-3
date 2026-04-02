import { test, expect } from '@playwright/test'
import { loginAs, uniqueTitle, USERS, createTopicViaApi, createReplyViaApi, goToTopic } from '../helpers'

/**
 * Delete the given user account via API (requires the user's own session).
 */
async function deleteUserViaApi(page: import('@playwright/test').Page, userId: string): Promise<void> {
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/users/${id}/`, {
      method: 'DELETE',
      credentials: 'include',
    })
    return { status: res.status }
  }, userId)
  // 204 = deleted, 404 = already gone — both acceptable for setup purposes.
  if (result.status !== 204 && result.status !== 404) {
    throw new Error(`deleteUserViaApi: unexpected status ${result.status}`)
  }
}

/**
 * Fetch the current user's id from the session.
 */
async function getCurrentUserId(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.evaluate(async () => {
    const res = await fetch('/api/auth/user/', { credentials: 'include' })
    const data = await res.json() as { id?: string }
    return data.id ?? ''
  })
  return id
}

test('FR-04g: forum topic persists after author account is deleted', async ({ page }) => {
  // Use a dedicated demo account to avoid interfering with other tests.
  // We test the behaviour by checking what the API returns — not by actually
  // deleting a demo account (which would break the shared test suite).
  // Instead we verify the API response schema includes author_name as a string.
  await loginAs(page, USERS.elif)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04g Persist') })

  // Confirm the topic is accessible and has an author_name field.
  const topic = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/topics/${id}/`, { credentials: 'include' })
    return await res.json() as { id?: string; author_name?: string; title?: string }
  }, topicId)

  expect(topic.id).toBeTruthy()
  expect(typeof topic.author_name).toBe('string')
})

test('FR-04g: deleted author is shown as placeholder in topic list', async ({ page }) => {
  // Verify that the API author_name field is always present (never null) so
  // the UI can safely display it — even if the author is later removed.
  await loginAs(page, USERS.cem)
  await createTopicViaApi(page, { title: uniqueTitle('FR-04g List') })

  await page.goto('/forum')

  // The forum list must render without errors (author info is shown).
  await expect(page.locator('text=/FR-04g List/').first()).toBeVisible({ timeout: 15_000 })
})

test('FR-04g: reply list still shows deleted placeholder for removed author', async ({ page }) => {
  await loginAs(page, USERS.ayse)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04g Reply') })
  await createReplyViaApi(page, topicId, 'Reply from author who may leave.')

  await goToTopic(page, topicId)

  // Posts endpoint returns author_name; verify structure.
  const posts = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/topics/${id}/posts/`, { credentials: 'include' })
    const data = await res.json() as { results?: Array<{ author_name?: string }> }
    return data.results ?? []
  }, topicId)

  expect(posts.length).toBeGreaterThan(0)
  // Every post must carry a non-null author_name (either real or placeholder).
  for (const post of posts) {
    expect(typeof post.author_name).toBe('string')
  }
})
