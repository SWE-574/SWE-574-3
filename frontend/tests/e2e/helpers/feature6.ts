import { expect, type Page } from '@playwright/test'

import { loginAs, type DemoUser, USERS } from './auth'
import { switchUser } from './session'

const BALANCE_CANDIDATES: DemoUser[] = [
  USERS.elif,
  USERS.cem,
  USERS.ayse,
  USERS.mehmet,
  USERS.zeynep,
  USERS.can,
  USERS.deniz,
  USERS.burak,
  USERS.yasemin,
]

export async function createNeed(page: Page, options: {
  title: string
  description?: string
  duration?: number
  online?: boolean
}): Promise<{ detailUrl: string }> {
  const {
    title,
    description = 'Playwright creates this request for Feature 6 verification.',
    duration = 1,
    online = true,
  } = options

  await page.goto('/post-need')

  await page.locator('input[name="title"]').fill(title)
  await page.locator('textarea[name="description"]').fill(description)
  await page.locator('input[name="duration"]').fill(String(duration))

  if (online) {
    await page.getByRole('button', { name: 'Online' }).click()
  }

  await page.getByRole('button', { name: 'Post Need' }).click()
  await expect(page).toHaveURL(/\/service-detail\//, { timeout: 20_000 })

  return { detailUrl: page.url() }
}

export async function getCurrentBalance(page: Page): Promise<number> {
  const balance = await page.evaluate(async () => {
    const response = await fetch(`/api/users/me/?_=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Could not read current user balance: ${response.status}`)
    }

    const data = await response.json() as { timebank_balance?: number | string }
    return Number(data.timebank_balance ?? 0)
  })

  return Number(balance)
}

export async function expectNavbarBalance(page: Page, expectedBalance: number): Promise<void> {
  const formatted = Number.isInteger(expectedBalance)
    ? `${expectedBalance}(?:\\.0)?`
    : expectedBalance.toFixed(1).replace('.', '\\.')
  const balanceText = page.getByRole('button', {
    name: new RegExp(`⏱\\s*${formatted}h`),
  }).first()

  await expect.poll(async () => getCurrentBalance(page), {
    timeout: 10_000,
  }).toBe(expectedBalance)

  try {
    await expect(balanceText).toBeVisible({ timeout: 2_000 })
  } catch {
    // Force a profile bootstrap when the SPA is still rendering the previous
    // in-memory user snapshot after a fast service create/delete transition.
    await page.reload({ waitUntil: 'load' })
    await expect(balanceText).toBeVisible({ timeout: 10_000 })
  }
}

export async function loginAsUserWithBalanceBelow(
  page: Page,
  maxExclusive: number,
): Promise<{ user: DemoUser; balance: number }> {
  let firstLogin = true

  for (const user of BALANCE_CANDIDATES) {
    if (firstLogin) {
      await loginAs(page, user)
      firstLogin = false
    } else {
      await switchUser(page, user)
    }

    const balance = await getCurrentBalance(page)
    if (balance < maxExclusive) {
      return { user, balance }
    }
  }

  throw new Error(`Could not find a demo user with balance below ${maxExclusive}.`)
}

export async function loginAsUserWithBalanceAtLeast(
  page: Page,
  minInclusive: number,
): Promise<{ user: DemoUser; balance: number }> {
  let firstLogin = true

  for (const user of BALANCE_CANDIDATES) {
    if (firstLogin) {
      await loginAs(page, user)
      firstLogin = false
    } else {
      await switchUser(page, user)
    }

    const balance = await getCurrentBalance(page)
    if (balance >= minInclusive) {
      return { user, balance }
    }
  }

  throw new Error(`Could not find a demo user with balance at least ${minInclusive}.`)
}
