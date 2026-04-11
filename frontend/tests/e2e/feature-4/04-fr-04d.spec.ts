import { test, expect } from '@playwright/test'
import { loginAs, switchUser, uniqueTitle, USERS, createTopicViaApi, createReplyViaApi, goToTopic } from '../helpers'

test('FR-04d: author can edit their own reply', async ({ page }) => {
  await loginAs(page, USERS.ayse)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04d Edit') })
  await createReplyViaApi(page, topicId, 'Original reply text before edit.')

  await goToTopic(page, topicId)

  // Wait for auth to be confirmed (reply form only renders when isAuthenticated).
  await expect(page.getByPlaceholder(/Write your reply/i)).toBeVisible({ timeout: 10_000 })

  // Wait for the reply body to appear.
  const replyBody = page.getByText('Original reply text before edit.').first()
  await expect(replyBody).toBeVisible({ timeout: 10_000 })

  // The edit button (FiEdit2 icon) is the first <button> inside the post content
  // area (the Box flex=1 that contains both the header row and the body text).
  // Chakra UI v3 does not forward the `title` prop to the DOM, so we locate by position.
  const postArea = replyBody.locator('..')
  const editBtn = postArea.locator('button').first()
  await expect(editBtn).toBeVisible({ timeout: 5_000 })
  await editBtn.click()

  // An inline edit form should appear with a textarea.
  const editArea = page.locator('textarea').last()
  await expect(editArea).toBeVisible({ timeout: 5_000 })

  await editArea.fill('Edited reply text after update.')
  await page.getByRole('button', { name: /save/i }).last().click()

  // The updated text should appear and "(edited)" label should be shown.
  await expect(page.getByText('Edited reply text after update.').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('(edited)').first()).toBeVisible({ timeout: 5_000 })
})

test('FR-04d: author can soft-delete their own reply', async ({ page }) => {
  await loginAs(page, USERS.cem)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04d Delete') })
  const replyText = uniqueTitle('FR-04d Reply')
  await createReplyViaApi(page, topicId, replyText)

  await goToTopic(page, topicId)

  // Wait for auth and posts to load.
  await expect(page.getByPlaceholder(/Write your reply/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(replyText).first()).toBeVisible({ timeout: 10_000 })

  // Click the Delete button (second icon button inside the post card) via DOM evaluation.
  // PostCard renders: Box flex=1 > Flex header > Flex buttons > [button Edit, button Delete].
  // We find the <p> that contains the reply body text, walk up to Box flex=1,
  // then query the second <button> within it.
  await page.evaluate((text) => {
    const para = Array.from(document.querySelectorAll('p'))
      .find((p) => p.textContent?.includes(text))
    if (!para) throw new Error('Reply paragraph not found')
    const contentDiv = para.parentElement
    if (!contentDiv) throw new Error('Content div not found')
    const buttons = contentDiv.querySelectorAll('button')
    if (buttons.length < 2) throw new Error(`Expected ≥2 buttons, got ${buttons.length}`)
    ;(buttons[1] as HTMLElement).click()
  }, replyText)

  // Confirmation row appears: "Delete post?" with FiCheck (confirm) and FiX (cancel).
  await expect(page.getByText('Delete?').first()).toBeVisible({ timeout: 5_000 })

  // Click the FiCheck button to confirm deletion (first button in the confirmation row).
  await page.evaluate(() => {
    const confirmText = Array.from(document.querySelectorAll('p, span, div'))
      .find((el) => el.textContent?.trim() === 'Delete?')
    if (!confirmText) throw new Error('Confirm text not found')
    const confirmRow = confirmText.parentElement
    if (!confirmRow) throw new Error('Confirm row not found')
    const confirmBtn = confirmRow.querySelector('button') as HTMLElement | null
    if (!confirmBtn) throw new Error('Confirm button not found')
    confirmBtn.click()
  })

  // The post body is replaced with the soft-deleted placeholder.
  await expect(page.getByText('Deleted!').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(replyText)).toHaveCount(0)
})

test('FR-04d: other users cannot edit a reply they did not write', async ({ page }) => {
  // Elif creates the topic and a reply.
  await loginAs(page, USERS.elif)
  const topicId = await createTopicViaApi(page, { title: uniqueTitle('FR-04d No-Edit') })
  const postId = await createReplyViaApi(page, topicId, 'Elif wrote this reply.')

  // Switch to Mehmet and verify the PATCH API is rejected (the backend enforces ownership).
  await switchUser(page, USERS.mehmet)

  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/forum/posts/${id}/`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Tampered body by wrong user.' }),
    })
    return { status: res.status }
  }, postId)

  expect(result.status).toBe(403)
})
