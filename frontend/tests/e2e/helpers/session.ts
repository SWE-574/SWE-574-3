import { type Page } from '@playwright/test'

import { loginAs, type DemoUser } from './auth'

export async function switchUser(page: Page, user: DemoUser): Promise<void> {
  await page.context().clearCookies()

  if (/^https?:\/\//.test(page.url())) {
    await page.evaluate(() => {
      try {
        window.localStorage.clear()
        window.sessionStorage.clear()
      } catch {
        // Ignore storage access issues on special pages and continue with a fresh login.
      }
    })
  }

  // Drop the previous user's /users/me/ route so the new identity isn't
  // shadowed by a stale handler closing over the old user payload.
  await page.unroute('**/api/users/me/').catch(() => {
    /* nothing to unroute */
  })

  await loginAs(page, user)
}
