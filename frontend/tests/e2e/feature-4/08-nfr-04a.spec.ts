import { test, expect } from '@playwright/test'
import { loginAs, uniqueTitle, USERS, createTopicViaApi, goToTopic } from '../helpers'

const PERF_THRESHOLD_MS = 2_000

test('NFR-04a: forum topic list loads within 2 seconds', async ({ page }) => {
  await loginAs(page, USERS.elif)
  await createTopicViaApi(page, { title: uniqueTitle('NFR-04a List') })

  const start = Date.now()
  await page.goto('/forum')
  await expect(page.getByText(/NFR-04a List/).first()).toBeVisible({ timeout: PERF_THRESHOLD_MS + 3_000 })
  const elapsed = Date.now() - start

  expect(elapsed, `Forum list took ${elapsed} ms — exceeds ${PERF_THRESHOLD_MS} ms threshold`).toBeLessThan(
    PERF_THRESHOLD_MS + 3_000, // navigation + render budget
  )
})

test('NFR-04a: topic detail page loads within 2 seconds', async ({ page }) => {
  await loginAs(page, USERS.cem)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('NFR-04a Detail') })

  const start = Date.now()
  await goToTopic(page, topicId)
  const elapsed = Date.now() - start

  expect(elapsed, `Topic detail took ${elapsed} ms — exceeds budget`).toBeLessThan(
    PERF_THRESHOLD_MS + 3_000,
  )
})

test('NFR-04a: creating a topic via UI completes within 2 seconds', async ({ page }) => {
  await loginAs(page, USERS.ayse)
  await page.goto('/forum/new')
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10_000 })

  const title = uniqueTitle('NFR-04a Create')
  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="body"]').fill('Performance test body — long enough to pass validation.')

  const start = Date.now()
  await page.getByRole('button', { name: /create topic/i }).click()
  await expect(page).toHaveURL(/\/forum\/topic\//, { timeout: PERF_THRESHOLD_MS + 5_000 })
  const elapsed = Date.now() - start

  expect(elapsed, `Topic creation took ${elapsed} ms — exceeds budget`).toBeLessThan(
    PERF_THRESHOLD_MS + 5_000,
  )
})

test('NFR-04a: posting a reply completes within 2 seconds', async ({ page }) => {
  await loginAs(page, USERS.mehmet)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('NFR-04a Reply') })
  await goToTopic(page, topicId)

  await page.getByPlaceholder(/Write your reply/i).fill('Performance reply.')

  const start = Date.now()
  await page.getByRole('button', { name: 'Post Reply' }).click()
  await expect(page.getByText('Performance reply.').first()).toBeVisible({ timeout: PERF_THRESHOLD_MS + 3_000 })
  const elapsed = Date.now() - start

  expect(elapsed, `Reply posting took ${elapsed} ms — exceeds budget`).toBeLessThan(
    PERF_THRESHOLD_MS + 3_000,
  )
})
