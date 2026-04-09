import { test, expect } from '@playwright/test'
import { loginAs, uniqueTitle, USERS, createTopicViaApi, createReplyViaApi } from '../helpers'

test('NFR-04b: unauthenticated user cannot create a topic via API', async ({ page }) => {
  // Navigate to the app so relative URLs resolve, then clear the session.
  await page.goto('/forum')
  await page.context().clearCookies()

  const categoryId = await page.evaluate(async () => {
    const res = await fetch('/api/forum/categories/')
    const cats = await res.json() as Array<{ id: string; is_active: boolean }>
    return cats.find((c) => c.is_active)?.id ?? ''
  })

  const result = await page.evaluate(async (catId) => {
    const res = await fetch('/api/forum/topics/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Anon topic', body: 'Should fail.', category: catId }),
    })
    return { status: res.status }
  }, categoryId)

  expect(result.status).toBe(401)
})

test('NFR-04b: unauthenticated user cannot post a reply via API', async ({ page }) => {
  // Create a topic with a logged-in user first.
  await loginAs(page, USERS.elif)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('NFR-04b Reply Auth') })

  // Clear session (page is still at a known URL so relative fetches work).
  await page.context().clearCookies()

  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/topics/${id}/posts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Anonymous reply attempt.' }),
    })
    return { status: res.status }
  }, topicId)

  expect(result.status).toBe(401)
})

test('NFR-04b: unauthenticated user cannot submit a new topic via the form', async ({ page }) => {
  // The SPA renders the form regardless of auth state, but the API call must fail.
  // Navigate to the create page, clear cookies, fill and submit — expect an error toast
  // or for the page to remain on /forum/new (no redirect to topic detail).
  await loginAs(page, USERS.ayse)
  await page.goto('/forum/new')
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10_000 })

  // Log out by clearing cookies while the page stays on /forum/new.
  await page.context().clearCookies()

  await page.locator('input[name="title"]').fill('Anon new topic attempt')
  await page.locator('textarea[name="body"]').fill('Body text that is long enough to pass client-side validation.')
  await page.getByRole('button', { name: /create topic/i }).click()

  // The submission must fail: the page must NOT navigate to a topic detail URL.
  await expect(page).not.toHaveURL(/\/forum\/topic\//, { timeout: 10_000 })
})

test('NFR-04b: user cannot delete another user\'s reply', async ({ page }) => {
  await loginAs(page, USERS.cem)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('NFR-04b Del Auth') })
  const postId = await createReplyViaApi(page, topicId, 'Cem wrote this reply.')

  // Switch to Ayse and attempt to delete Cem's reply.
  await loginAs(page, USERS.ayse)

  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/posts/${id}/`, {
      method: 'DELETE',
      credentials: 'include',
    })
    return { status: res.status }
  }, postId)

  // Must be forbidden.
  expect(result.status).toBe(403)
})

test('NFR-04b: user cannot edit another user\'s reply', async ({ page }) => {
  await loginAs(page, USERS.mehmet)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('NFR-04b Edit Auth') })
  const postId = await createReplyViaApi(page, topicId, 'Mehmet wrote this reply.')

  await loginAs(page, USERS.ayse)

  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/posts/${id}/`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Tampered reply body.' }),
    })
    return { status: res.status }
  }, postId)

  expect(result.status).toBe(403)
})
