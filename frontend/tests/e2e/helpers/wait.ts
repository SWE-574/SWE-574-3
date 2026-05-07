import type { Page } from '@playwright/test'

/**
 * Deterministic replacement for `page.waitForTimeout(ms)`.
 *
 * `waitForTimeout` is the most common source of flake in this suite — it
 * waits a fixed wall-clock duration regardless of what the UI is actually
 * doing, so it sometimes lets the test continue before the network has
 * landed (false negative) and other times wastes seconds after the work is
 * already done (slow suite).
 *
 * Prefer one of these instead, in order of preference:
 *
 *   1. `expect(locator).toBeVisible()` / `toHaveText(...)` — Playwright's
 *      auto-retrying assertions (10 s default, see `expect.timeout` in
 *      playwright.config.ts).
 *   2. `await page.waitForResponse(url => url.includes('/api/...'))` when
 *      the test is gating on a specific request.
 *   3. `await waitForUI(page, () => condition)` (this helper) when the
 *      readiness signal is a JS expression evaluated in the page.
 *   4. Last-resort `await waitForIdle(page)` — short, debounced wait that
 *      yields to network + a paint.
 *
 * Hardcoded timeouts should only survive in cases where the UI is
 * intentionally rate-limited (e.g. a debounce window) and the wait
 * duration matches that constant exactly.
 */

export type WaitOptions = {
  timeout?: number
  pollInterval?: number
  message?: string
}

/**
 * Wait until the supplied predicate (evaluated inside the page) returns
 * truthy. Polls until the timeout. Throws with a descriptive message.
 */
export async function waitForUI(
  page: Page,
  predicate: () => boolean | Promise<boolean>,
  options: WaitOptions = {},
): Promise<void> {
  const { timeout = 10_000, pollInterval = 100, message = 'predicate did not become truthy in time' } = options
  await page.waitForFunction(predicate, undefined, {
    timeout,
    polling: pollInterval,
  }).catch(() => {
    throw new Error(`waitForUI: ${message}`)
  })
}

/**
 * Yield to one network round-trip + the next paint. Useful right after an
 * action whose effect is "the page should now be quiet" (e.g. closing a
 * modal that triggers a re-render). Caps at 1 s so it cannot mask a real
 * regression.
 */
export async function waitForIdle(page: Page, ms: number = 250): Promise<void> {
  await page.evaluate(
    (delay) =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, delay)),
      ),
    ms,
  )
}

/**
 * Wait for a backend request matching `urlSubstring` (status 2xx). Returns
 * the response so callers can assert on the body.
 */
export async function waitForApi(page: Page, urlSubstring: string, timeout = 10_000) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(urlSubstring) && response.status() < 400,
    { timeout },
  )
}
