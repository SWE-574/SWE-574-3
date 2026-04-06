import { test, expect } from '@playwright/test'

test('NFR-07b: only authenticated users can read Time Share state or reach balance-mutating entry points', async ({ page }) => {
  // Anonymous users should not be able to open the private Time Activity page.
  await page.goto('/transaction-history')
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

  // Anonymous users should also be redirected before reaching a balance-mutating request form.
  await page.goto('/post-need')
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

  // Backend balance and ledger endpoints should remain unauthorized without a valid session.
  const statuses = await page.evaluate(async () => {
    const [meResponse, transactionsResponse] = await Promise.all([
      fetch('/api/users/me/', { credentials: 'include' }),
      fetch('/api/transactions/', { credentials: 'include' }),
    ])

    return {
      me: meResponse.status,
      transactions: transactionsResponse.status,
    }
  })

  expect(statuses.me).toBe(401)
  expect(statuses.transactions).toBe(401)
})
