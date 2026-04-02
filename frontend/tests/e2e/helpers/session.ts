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

  await loginAs(page, user)
}
