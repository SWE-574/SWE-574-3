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
  yasemin:{ email: 'yasemin@demo.com',password: 'demo123', name: 'Yasemin Ergin' },
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
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Wait until we have left the login page (redirected to dashboard or /)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  // Wait for the authenticated shell to fully render — the user-menu-trigger
  // only appears once the Navbar mounts AND auth state is hydrated.
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible({ timeout: 30_000 })
}

/**
 * Open the user dropdown menu in the desktop navbar.
 * Works regardless of whether the user has an avatar image or initials.
 */
export async function openUserMenu(page: Page): Promise<void> {
  const trigger = page.getByTestId('user-menu-trigger')
  await expect(trigger).toBeVisible({ timeout: 10_000 })
  await trigger.click()
  // Wait for the dropdown to open (Log Out item becomes visible)
  await expect(page.getByText('Log Out')).toBeVisible({ timeout: 5_000 })
}

/**
 * Log the current user out via the navbar dropdown.
 * Resolves once the page has left the dashboard.
 */
export async function logout(page: Page): Promise<void> {
  await openUserMenu(page)
  await page.getByText('Log Out').click()
  await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 10_000 })
}

/**
 * Wait for a toast notification containing the given text.
 */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  // Sonner toasts are rendered in a <li> inside [data-sonner-toaster]
  const toast = page.locator('[data-sonner-toaster] li').filter({ hasText: text })
  await expect(toast.first()).toBeVisible({ timeout: 10_000 })
}
