import { expect, type Page } from '@playwright/test'

export const ADMIN = { email: 'moderator@demo.com', password: 'demo123', name: 'Moderator' }

/**
 * Create a forum topic via UI. Assumes the user is already logged in.
 * Returns the topic detail URL.
 */
export async function createForumTopic(page: Page, options: {
  title: string
  body?: string
  categoryIndex?: number
}): Promise<{ topicUrl: string; topicId: string }> {
  const {
    title,
    body = 'Playwright writes this body for a Feature 4 forum topic verification test.',
    categoryIndex = 0,
  } = options

  await page.goto('/forum/new')
  await expect(page.locator('select')).toBeVisible({ timeout: 10_000 })

  // Pick category by position (first available).
  const options_ = page.locator('select option')
  const count = await options_.count()
  if (count > categoryIndex) {
    const value = await options_.nth(categoryIndex).getAttribute('value')
    if (value) await page.locator('select').selectOption(value)
  }

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="body"]').fill(body)
  await page.getByRole('button', { name: 'Post Topic' }).click()

  await expect(page).toHaveURL(/\/forum\/topic\//, { timeout: 20_000 })
  const topicUrl = page.url()
  const topicId = topicUrl.split('/forum/topic/')[1]?.split('/')[0] ?? ''
  return { topicUrl, topicId }
}

/**
 * Create a forum topic via the backend API while the user is authenticated
 * through the browser session. Returns the created topic id.
 */
export async function createTopicViaApi(page: Page, options: {
  title: string
  body?: string
}): Promise<string> {
  const { title } = options
  const body = options.body ?? 'API-assisted body for Feature 4 e2e setup.'
  const result = await page.evaluate(async ({ title, body }) => {
    const catRes = await fetch('/api/forum/categories/', { credentials: 'include' })
    const cats = await catRes.json() as Array<{ id: string; is_active: boolean }>
    const category = cats.find((c) => c.is_active)
    if (!category) return { ok: false, id: '' }

    const res = await fetch('/api/forum/topics/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, category: category.id }),
    })
    const data = await res.json() as { id?: string }
    return { ok: res.ok, id: data.id ?? '' }
  }, { title, body })

  expect(result.ok, `createTopicViaApi failed for title: ${options.title}`).toBeTruthy()
  return result.id
}

/**
 * Create a reply on a topic via the backend API while the user is authenticated.
 * Returns the created post id.
 */
export async function createReplyViaApi(page: Page, topicId: string, body: string): Promise<string> {
  const result = await page.evaluate(async ({ topicId, body }) => {
    const res = await fetch(`/api/forum/topics/${topicId}/posts/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const data = await res.json() as { id?: string }
    return { ok: res.ok, id: data.id ?? '' }
  }, { topicId, body })

  expect(result.ok, `createReplyViaApi failed for topic: ${topicId}`).toBeTruthy()
  return result.id
}

/**
 * Lock or unlock a topic via the backend API (requires admin session).
 */
export async function lockTopicViaApi(page: Page, topicId: string): Promise<void> {
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/topics/${id}/lock/`, {
      method: 'POST',
      credentials: 'include',
    })
    return { ok: res.ok, status: res.status }
  }, topicId)
  expect(result.ok, `lockTopicViaApi failed: ${result.status}`).toBeTruthy()
}

/**
 * Navigate directly to a forum topic by id.
 */
export async function goToTopic(page: Page, topicId: string): Promise<void> {
  await page.goto(`/forum/topic/${topicId}`)
  await expect(page.locator('text=replies').first()).toBeVisible({ timeout: 15_000 })
}
