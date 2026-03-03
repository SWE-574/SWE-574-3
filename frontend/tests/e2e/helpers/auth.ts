import { type Page, expect } from '@playwright/test'

// ─── Demo user credentials (seeded by setup_demo.py) ─────────────────────────
export const USERS = {
  elif:   { email: 'elif@demo.com',   password: 'demo123', name: 'Elif Yılmaz' },
  cem:    { email: 'cem@demo.com',    password: 'demo123', name: 'Cem Demir'   },
  ayse:   { email: 'ayse@demo.com',   password: 'demo123', name: 'Ayşe Kaya'   },
  mehmet: { email: 'mehmet@demo.com', password: 'demo123', name: 'Mehmet Özkan' },
  zeynep: { email: 'zeynep@demo.com', password: 'demo123', name: 'Zeynep Arslan' },
  can:    { email: 'can@demo.com',    password: 'demo123', name: 'Can Şahin'   },
  deniz:  { email: 'deniz@demo.com',  password: 'demo123', name: 'Deniz Aydın' },
  burak:  { email: 'burak@demo.com',  password: 'demo123', name: 'Burak Kurt'  },
} as const

export type DemoUser = (typeof USERS)[keyof typeof USERS]

/**
 * Navigate to /login and sign in.
 * Resolves once the dashboard / any protected page is fully loaded.
 */
export async function loginAs(page: Page, user: DemoUser): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(user.email)
  await page.locator('#password').fill(user.password)
  await page.getByRole('button', { name: 'Log In' }).click()

  // Wait until we have left the login page (redirected to dashboard or /)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })
}

/**
 * Wait for a toast notification containing the given text.
 */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  // Sonner toasts are rendered in a <li> inside [data-sonner-toaster]
  const toast = page.locator('[data-sonner-toaster] li').filter({ hasText: text })
  await expect(toast.first()).toBeVisible({ timeout: 10_000 })
}
