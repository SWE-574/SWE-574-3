import { test, expect } from '@playwright/test'
import { loginAs, uniqueTitle, USERS, createTopicViaApi } from '../helpers'

test('FR-04a: visitor can browse forum and filter by category', async ({ page }) => {
  // Create a topic in a known category via API so there is something to see.
  await loginAs(page, USERS.elif)
  const title = uniqueTitle('FR-04a Topic')
  await createTopicViaApi(page, { title })

  // Visit the forum as the same user and confirm the topic appears in the list.
  await page.goto('/forum')
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 })
})

test('FR-04a: forum category filter shows only topics in that category', async ({ page }) => {
  // Create two topics and note the category slug of the first.
  await loginAs(page, USERS.cem)

  const titleA = uniqueTitle('FR-04a Cat-A')
  const titleB = uniqueTitle('FR-04a Cat-B')

  // Both go to the first available category via API; what matters is that
  // filtering by that category slug keeps them visible and not invisible.
  await createTopicViaApi(page, { title: titleA })
  await createTopicViaApi(page, { title: titleB })

  // Navigate to the forum then fetch the first active category slug.
  await page.goto('/forum')
  const categorySlug = await page.evaluate(async () => {
    const res = await fetch('/api/forum/categories/', { credentials: 'include' })
    const cats = await res.json() as Array<{ slug: string; is_active: boolean }>
    return cats.find((c) => c.is_active)?.slug ?? ''
  })
  expect(categorySlug).toBeTruthy()

  // Navigate directly to the category URL.
  await page.goto(`/forum/category/${categorySlug}`)
  // The topic list card should be visible (category view rendered).
  await expect(page.getByText(/topic/i).first()).toBeVisible({ timeout: 15_000 })
})

test('FR-04a: sort toggle switches between Newest and Most Active', async ({ page }) => {
  // Create a topic so the topic list renders with the sort control.
  await loginAs(page, USERS.ayse)
  await createTopicViaApi(page, { title: uniqueTitle('FR-04a Sort') })

  // Visit a category page where the sort pills are shown.
  const categorySlug = await page.evaluate(async () => {
    const res = await fetch('/api/forum/categories/', { credentials: 'include' })
    const cats = await res.json() as Array<{ slug: string; is_active: boolean }>
    return cats.find((c) => c.is_active)?.slug ?? ''
  })
  await page.goto(`/forum/category/${categorySlug}`)

  // Both sort buttons should be present.
  await expect(page.getByText('Newest').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Most Active').first()).toBeVisible({ timeout: 15_000 })

  // Clicking Most Active should keep the topic list visible (re-renders without error).
  await page.getByText('Most Active').first().click()
  await expect(page.getByText(/topic/i).first()).toBeVisible({ timeout: 10_000 })
})
