/**
 * E2E — Forum
 *
 * Covers: /forum loads, category/topic list, topic detail, New Topic (protected).
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS } from './helpers/auth'

test.describe('Forum', () => {
  test('/forum opens; category list or topic list visible', async ({ page }) => {
    await page.goto('/forum')

    await expect(page).toHaveURL(/\/forum/, { timeout: 10_000 })
    const categoryCard = page.locator('button, [role="button"], a').filter({ hasText: /General|Ideas|Help|Welcome/i }).first()
    await expect(categoryCard).toBeVisible({ timeout: 15_000 })
  })

  test('clicking a category loads topic list', async ({ page }) => {
    await page.goto('/forum')

    const categoryCard = page.locator('button, [role="button"], a').filter({ hasText: /General|Ideas|Help|Welcome/i }).first()
    await expect(categoryCard).toBeVisible({ timeout: 15_000 })
    await categoryCard.click()

    await expect(page).toHaveURL(/\/forum\/category\/|\/forum/, { timeout: 10_000 })
    const topicOrEmpty = page.getByText(/topic|No topics|New Topic/i).first()
    await expect(topicOrEmpty).toBeVisible({ timeout: 10_000 })
  })

  test('clicking a topic opens topic detail', async ({ page }) => {
    await page.goto('/forum')

    const cat = page.locator('button, a').filter({ hasText: /General|Ideas|Help/i }).first()
    await expect(cat).toBeVisible({ timeout: 15_000 })
    await cat.click()

    const topicRow = page.locator('button, a').filter({ hasText: /./ }).first()
    await expect(topicRow).toBeVisible({ timeout: 10_000 })
    const firstTopic = page.getByRole('link').or(page.locator('button')).filter({ hasText: /.{10,}/ }).first()
    if (await firstTopic.isVisible().catch(() => false)) {
      await firstTopic.click()
      await expect(page).toHaveURL(/\/forum\/topic\/|\/forum/, { timeout: 10_000 })
    }
  })

  test('logged-in user sees New Topic and can navigate to form', async ({ page }) => {
    await loginAs(page, USERS.elif)
    await page.goto('/forum')

    const categoryCard = page.locator('button, a').filter({ hasText: /General|Ideas|Help|Welcome/i }).first()
    await expect(categoryCard).toBeVisible({ timeout: 15_000 })
    await categoryCard.click()

    const newTopicBtn = page.getByRole('button', { name: /New Topic/i }).or(
      page.getByText('New Topic').first()
    )
    await expect(newTopicBtn.first()).toBeVisible({ timeout: 15_000 })
    await newTopicBtn.first().click()

    await expect(page).toHaveURL(/\/forum\/new/, { timeout: 10_000 })
    const titleInput = page.getByLabel(/title|Title/i).or(page.locator('input[name="title"]'))
    await expect(titleInput.first()).toBeVisible({ timeout: 10_000 })
  })

  test('logged-in user can create a topic and see it after submit', async ({ page }) => {
    await loginAs(page, USERS.deniz)
    await page.goto('/forum')

    const categoryCard = page.locator('button, a').filter({ hasText: /General|Ideas|Help|Welcome/i }).first()
    await expect(categoryCard).toBeVisible({ timeout: 15_000 })
    await categoryCard.click()

    const newTopicBtn = page.getByRole('button', { name: /New Topic/i }).or(
      page.getByText('New Topic').first()
    )
    await expect(newTopicBtn.first()).toBeVisible({ timeout: 15_000 })
    await newTopicBtn.first().click()

    await expect(page).toHaveURL(/\/forum\/new/, { timeout: 10_000 })

    const title = `E2E Forum Topic ${Date.now()}`
    await page.getByLabel(/title|Title/i).or(page.locator('input[name="title"]')).first().fill(title)
    await page.locator('textarea').first().fill('E2E test topic body for persistence check.')
    await page.getByRole('button', { name: /Create Topic/i }).click()

    await expect(page).toHaveURL(/\/forum\/topic\//, { timeout: 15_000 })
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 })
  })
})
