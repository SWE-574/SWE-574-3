import { expect, type Page } from '@playwright/test'

/**
 * Set the currently logged-in user's timebank balance to an exact value.
 *
 * Requires DJANGO_E2E=1 on the backend. The user must already be
 * authenticated (call loginAs first).
 *
 * @example
 *   await loginAs(page, USERS.cem)
 *   await setBalance(page, 0)       // zero balance
 *   await setBalance(page, 100)     // high balance
 *   await setBalance(page, 0.5)     // exact fractional
 */
export async function setBalance(page: Page, balance: number): Promise<{ id: string; email: string; balance: number }> {
  const result = await page.evaluate(async (bal) => {
    const response = await fetch('/api/e2e/set-balance/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance: bal }),
    })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
  }, balance)

  expect(result.ok, `setBalance failed: ${result.status} ${result.body}`).toBeTruthy()
  return JSON.parse(result.body) as { id: string; email: string; balance: number }
}
