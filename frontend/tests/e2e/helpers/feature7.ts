import { expect, type Page } from '@playwright/test'

import { type DemoUser, loginAs, USERS } from './auth'
import { uniqueTitle } from './common'
import { createNeed, getCurrentBalance } from './feature6'
import {
  acceptPendingHandshakeViaApi,
  createOffer,
  extractServiceId,
  requestOfferFromDetail,
} from './feature5'
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

export interface CurrentUserPayload {
  id: string
  email: string
  timebank_balance: number
  first_name?: string
  last_name?: string
}

export interface LedgerTransaction {
  id: string
  handshake_id?: string | null
  service_id?: string | null
  transaction_type: string
  transaction_type_display: string
  amount: number
  balance_after: number
  description: string
  service_title?: string | null
  service_type?: string | null
  counterpart?: {
    id: string
    email: string
    first_name?: string
    last_name?: string
    avatar_url?: string | null
  } | null
  created_at: string
}

export interface TransactionPagePayload {
  count: number
  next: string | null
  previous: string | null
  summary: {
    current_balance: number
    total_earned: number
    total_spent: number
  }
  results: LedgerTransaction[]
}

export async function registerFreshUser(page: Page): Promise<{
  email: string
  password: string
  firstName: string
  lastName: string
}> {
  const timestamp = Date.now()
  const email = `feature7-${timestamp}@example.com`
  const password = 'Feature7Pass1'
  const firstName = 'Feature'
  const lastName = `Seven${timestamp}`

  await page.goto('/register')

  const result = await page.evaluate(async ({ email, password, firstName, lastName }) => {
    const response = await fetch('/api/auth/register/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
      }),
    })

    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
  }, {
    email,
    password,
    firstName,
    lastName,
  })

  expect(result.ok, `Register failed: ${result.status} ${result.body}`).toBeTruthy()

  return {
    email,
    password,
    firstName,
    lastName,
  }
}

export async function fetchCurrentUser(page: Page): Promise<CurrentUserPayload> {
  const user = await page.evaluate(async () => {
    const response = await fetch('/api/users/me/', {
      credentials: 'include',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Could not read current user: ${response.status}`)
    }

    const data = await response.json() as CurrentUserPayload
    return {
      ...data,
      timebank_balance: Number(data.timebank_balance ?? 0),
    }
  })

  return user
}

export async function listTransactions(
  page: Page,
  direction: 'all' | 'credit' | 'debit' = 'all',
): Promise<TransactionPagePayload> {
  const data = await page.evaluate(async ({ direction }) => {
    const response = await fetch(`/api/transactions/?page=1&direction=${direction}`, {
      credentials: 'include',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Could not read transactions: ${response.status}`)
    }

    return await response.json()
  }, { direction })

  const results = Array.isArray(data.results) ? data.results : []

  return {
    count: Number(data.count ?? results.length),
    next: data.next ?? null,
    previous: data.previous ?? null,
    summary: {
      current_balance: Number(data.summary?.current_balance ?? 0),
      total_earned: Number(data.summary?.total_earned ?? 0),
      total_spent: Number(data.summary?.total_spent ?? 0),
    },
    results: results.map((transaction: LedgerTransaction) => ({
      ...transaction,
      amount: Number(transaction.amount ?? 0),
      balance_after: Number(transaction.balance_after ?? 0),
    })),
  }
}

export async function openTimeActivity(page: Page): Promise<void> {
  await page.goto('/transaction-history')
  await expect(page.getByText(/^Time Activity$/).first()).toBeVisible({ timeout: 15_000 })
}

export async function pickUsersWithBalanceAtLeast(
  page: Page,
  minInclusive: number,
  count: number,
  excludedEmails: string[] = [],
): Promise<Array<{ user: DemoUser; balance: number }>> {
  let firstLogin = true
  const picked: Array<{ user: DemoUser; balance: number }> = []
  const blocked = new Set(excludedEmails)

  for (const user of BALANCE_CANDIDATES) {
    if (blocked.has(user.email)) continue

    if (firstLogin) {
      await loginAs(page, user)
      firstLogin = false
    } else {
      await switchUser(page, user)
    }

    const balance = await getCurrentBalance(page)
    if (balance >= minInclusive) {
      picked.push({ user, balance })
      blocked.add(user.email)
    }

    if (picked.length === count) {
      return picked
    }
  }

  throw new Error(`Could not find ${count} demo users with balance at least ${minInclusive}.`)
}

export async function createAcceptedOfferExchange(page: Page, options: {
  owner: DemoUser
  requester: DemoUser
  title?: string
  duration?: number
}): Promise<{
  title: string
  detailUrl: string
  serviceId: string
}> {
  const title = options.title ?? uniqueTitle('Feature 7 Offer')

  await loginAs(page, options.owner)
  const { detailUrl } = await createOffer(page, {
    title,
    description: `Playwright creates ${title} for Feature 7 verification.`,
    duration: options.duration ?? 1,
    online: true,
  })
  const serviceId = extractServiceId(detailUrl)

  await switchUser(page, options.requester)
  await page.goto(detailUrl)
  await requestOfferFromDetail(page)

  await switchUser(page, options.owner)
  await acceptPendingHandshakeViaApi(page, {
    serviceId,
    requesterName: options.requester.name,
  })

  return { title, detailUrl, serviceId }
}

export async function createAcceptedGroupOfferExchanges(page: Page, options: {
  owner: DemoUser
  requesters: DemoUser[]
  title?: string
  duration?: number
}): Promise<{
  title: string
  detailUrl: string
  serviceId: string
}> {
  const title = options.title ?? uniqueTitle('Feature 7 Group Offer')

  await loginAs(page, options.owner)
  const { detailUrl } = await createOffer(page, {
    title,
    description: `Playwright creates ${title} for Feature 7 group verification.`,
    duration: options.duration ?? 1,
    online: true,
    maxParticipants: options.requesters.length,
    meetingLink: 'https://meet.example.com/feature-7-group',
  })
  const serviceId = extractServiceId(detailUrl)

  for (const requester of options.requesters) {
    await switchUser(page, requester)
    await page.goto(detailUrl)
    await requestOfferFromDetail(page)
  }

  await switchUser(page, options.owner)
  for (const requester of options.requesters) {
    await acceptPendingHandshakeViaApi(page, {
      serviceId,
      requesterName: requester.name,
    })
  }

  return { title, detailUrl, serviceId }
}

export async function findHandshakeId(page: Page, options: {
  serviceTitle: string
  requesterName: string
  status?: string
}): Promise<string> {
  const maxAttempts = 20
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const handshakeId = await page.evaluate(async ({ serviceTitle, requesterName, status }) => {
      const response = await fetch('/api/handshakes/', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`Could not read handshakes: ${response.status}`)
      }

      const handshakes = await response.json() as Array<Record<string, unknown>>
      const target = handshakes.find((handshake) => (
        handshake.service_title === serviceTitle
        && handshake.requester_name === requesterName
        && (status ? handshake.status === status : true)
      ))

      return typeof target?.id === 'string' ? target.id : null
    }, options)

    if (handshakeId) {
      return handshakeId
    }

    if (attempt < maxAttempts - 1) {
      await page.waitForTimeout(500)
    }
  }

  throw new Error(`Could not find handshake for ${options.serviceTitle} / ${options.requesterName}.`)
}

export async function confirmHandshakeViaApi(page: Page, handshakeId: string): Promise<void> {
  const result = await page.evaluate(async ({ handshakeId }) => {
    const response = await fetch(`/api/handshakes/${handshakeId}/confirm/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
  }, { handshakeId })

  expect(result.ok, `Confirm handshake failed: ${result.status} ${result.body}`).toBeTruthy()
}

export async function completeOfferExchange(page: Page, options: {
  owner: DemoUser
  requester: DemoUser
  serviceTitle: string
}): Promise<void> {
  await switchUser(page, options.owner)
  const handshakeId = await findHandshakeId(page, {
    serviceTitle: options.serviceTitle,
    requesterName: options.requester.name,
    status: 'accepted',
  })
  await confirmHandshakeViaApi(page, handshakeId)

  await switchUser(page, options.requester)
  await confirmHandshakeViaApi(page, handshakeId)
}

export async function createRequestForTimeShare(page: Page, options: {
  title?: string
  duration?: number
}): Promise<{
  title: string
  detailUrl: string
}> {
  const title = options.title ?? uniqueTitle('Feature 7 Need')
  const detail = await createNeed(page, {
    title,
    description: `Playwright creates ${title} for Feature 7 verification.`,
    duration: options.duration ?? 1,
    online: true,
  })

  return {
    title,
    detailUrl: detail.detailUrl,
  }
}
