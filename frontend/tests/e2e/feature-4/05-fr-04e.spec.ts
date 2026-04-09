import { test, expect } from '@playwright/test'
import { loginAs, switchUser, uniqueTitle, USERS, createTopicViaApi, createReplyViaApi, goToTopic } from '../helpers'

test('FR-04e: authenticated user can report a topic', async ({ page }) => {
  // Create a topic as one user, report it as another.
  await loginAs(page, USERS.elif)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04e Report Topic') })

  await switchUser(page, USERS.cem)
  await goToTopic(page, topicId)

  // "Report topic" link should be visible.
  await expect(page.getByText(/report topic/i).first()).toBeVisible({ timeout: 10_000 })

  // Use the API directly to avoid window.prompt interaction in headless mode.
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/topics/${id}/report/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_type: 'spam', description: 'E2E report test.' }),
    })
    return { ok: res.ok, status: res.status }
  }, topicId)

  expect(result.ok, `Report topic API returned ${result.status}`).toBeTruthy()
})

test('FR-04e: authenticated user can report a reply', async ({ page }) => {
  await loginAs(page, USERS.ayse)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04e Report Reply') })
  const postId = await createReplyViaApi(page, topicId, 'Reply to be reported.')

  await switchUser(page, USERS.mehmet)

  // Report via API (window.prompt is unavailable in headless mode).
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/posts/${id}/report/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_type: 'harassment', description: 'E2E post report.' }),
    })
    return { ok: res.ok, status: res.status }
  }, postId)

  expect(result.ok, `Report post API returned ${result.status}`).toBeTruthy()
})

test('FR-04e: user cannot report their own topic', async ({ page }) => {
  await loginAs(page, USERS.cem)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04e Self Report') })

  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/topics/${id}/report/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_type: 'spam' }),
    })
    return { ok: res.ok, status: res.status }
  }, topicId)

  // Self-reports should be rejected (400 or 403).
  expect(result.ok).toBeFalsy()
})

test('FR-04e: unauthenticated user cannot report content', async ({ page }) => {
  await loginAs(page, USERS.elif)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04e Unauth Report') })

  // Log out by clearing cookies.
  await page.context().clearCookies()

  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/topics/${id}/report/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_type: 'spam' }),
    })
    return { status: res.status }
  }, topicId)

  expect(result.status).toBe(401)
})
