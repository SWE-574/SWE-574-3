import { test, expect, type Page } from '@playwright/test'
import {
  switchUser,
  uniqueTitle,
  USERS,
  expectToast,
  setupCompletedExchange,
} from '../helpers'

/**
 * FR-14g: Review photos are stored and displayed as thumbnails on the service
 * detail page; clicking a thumbnail opens a full-screen lightbox viewer.
 */

/** Minimal valid 1×1 JPEG bytes shared across tests. */
const MINIMAL_JPEG = new Uint8Array([
  0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,
  0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xff,0xd9,
])

/**
 * Submit evaluations for both parties via the UI and attach an image via the
 * add-review API.  Returns once the image has been confirmed uploaded.
 */
async function setupReviewWithPhoto(
  page: Page,
  options: {
    serviceDetailUrl: string
    serviceId: string
    handshakeId: string
    provider: typeof USERS[keyof typeof USERS]
    requester: typeof USERS[keyof typeof USERS]
  },
): Promise<void> {
  const { serviceDetailUrl, handshakeId, provider, requester } = options

  // ── Requester submits evaluation via UI ──────────────────────────────
  await switchUser(page, requester)
  await page.goto(serviceDetailUrl)
  await page.getByText(/Leave Evaluation/i).first().click()
  await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Helpful', exact: true }).click()
  // Include a comment so the Comment record is created alongside the ReputationRep
  await page.locator('textarea').fill('Excellent service, highly recommend!')
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()
  await expectToast(page, /Evaluation submitted/i)

  // ── Provider submits evaluation via UI to lift the blind-review filter ─
  await switchUser(page, provider)
  await page.goto(serviceDetailUrl)
  await page.getByText(/Leave Evaluation/i).first().click()
  await expect(page.getByRole('button', { name: 'Punctual', exact: true })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Punctual', exact: true }).click()
  await page.getByRole('button', { name: 'Submit Evaluation' }).click()
  await expectToast(page, /Evaluation submitted/i)

  // ── Requester attaches image via add-review API ──────────────────────
  await switchUser(page, requester)
  const uploadResult = await page.evaluate(
    async ({ hid, jpegBytes }: { hid: string; jpegBytes: number[] }) => {
      const blob = new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' })
      const fd = new FormData()
      fd.append('handshake_id', hid)
      fd.append('images', blob, 'review.jpg')
      const res = await fetch('/api/reputation/add-review/', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      return { ok: res.ok, status: res.status }
    },
    { hid: handshakeId, jpegBytes: Array.from(MINIMAL_JPEG) },
  )
  expect(uploadResult.ok, `Image attach failed with status ${uploadResult.status}`).toBeTruthy()
}

test('FR-14g: review photo thumbnails appear in Reviews tab after evaluation', async ({ page }) => {
  const title = uniqueTitle('FR-14g Thumbnail Offer')
  const provider = USERS.elif
  const requester = USERS.ayse

  const { serviceId, serviceDetailUrl, handshakeId } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  await setupReviewWithPhoto(page, { serviceDetailUrl, serviceId, handshakeId, provider, requester })

  // Navigate to service detail and verify thumbnail renders
  await page.goto(`/service-detail/${serviceId}`)
  await expect(
    page.locator('img[alt="Review photo"], img[alt*="Review"]').first()
  ).toBeVisible({ timeout: 15_000 })
})

test('FR-14g: clicking review photo thumbnail opens lightbox', async ({ page }) => {
  const title = uniqueTitle('FR-14g Lightbox Offer')
  const provider = USERS.elif
  const requester = USERS.ayse

  const { serviceId, serviceDetailUrl, handshakeId } = await setupCompletedExchange(page, {
    provider,
    requester,
    title,
  })

  await setupReviewWithPhoto(page, { serviceDetailUrl, serviceId, handshakeId, provider, requester })

  await page.goto(`/service-detail/${serviceId}`)

  // Click the thumbnail
  const thumbnail = page.locator('img[alt="Review photo"], img[alt*="Review"]').first()
  await expect(thumbnail).toBeVisible({ timeout: 15_000 })
  await thumbnail.click()

  // Lightbox overlay should appear
  await expect(page.getByText(/Photo 1 of/i)).toBeVisible({ timeout: 5_000 })

  // Close via the ✕ button (aria-label="Close lightbox")
  await page.getByRole('button', { name: 'Close lightbox' }).click()
  await expect(page.getByText(/Photo 1 of/i)).not.toBeVisible({ timeout: 3_000 })
})
