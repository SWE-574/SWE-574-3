import { expect, type Page } from '@playwright/test'

import { type DemoUser } from './auth'
import { futureDateParts } from './common'
import { createPendingOfferExchange, initiateOnlineHandshakeViaApi, postHandshakeAction } from './feature8'
import { completeOfferExchange } from './feature7'
import { switchUser } from './session'

export interface CompletedExchangeContext {
  serviceId: string
  handshakeId: string
  serviceDetailUrl: string
  title: string
  provider: DemoUser
  requester: DemoUser
}

/**
 * Set up a fully completed offer exchange for FR-14 evaluation tests.
 *
 * Flow: pending → provider initiates → requester approves → accepted → both confirm → completed
 *
 * After this call the page is logged in as `provider`.
 */
export async function setupCompletedExchange(
  page: Page,
  options: {
    provider: DemoUser
    requester: DemoUser
    title: string
    duration?: number
  },
): Promise<CompletedExchangeContext> {
  const { provider, requester, title, duration = 1 } = options

  // Steps 1-2: create offer as provider → requester requests → pending state.
  // After createPendingOfferExchange the page is logged in as requester.
  const { serviceId, detailUrl } = await createPendingOfferExchange(page, {
    owner: provider,
    requester,
    title,
    duration,
  })

  // Step 3: provider initiates session details → gets handshakeId.
  await switchUser(page, provider)
  const handshakeId = await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration,
    meetingLink: 'https://meet.example.com/fr-14',
  })

  // Step 4: requester approves session details → accepted.
  await switchUser(page, requester)
  const approveResult = await postHandshakeAction(page, handshakeId, 'approve', {})
  expect(
    approveResult.ok,
    `Approve session failed: ${approveResult.status} ${approveResult.body}`,
  ).toBeTruthy()

  // Steps 5-6: both parties confirm → completed.
  // completeOfferExchange switches to owner-confirm then requester-confirm.
  await completeOfferExchange(page, { owner: provider, requester, serviceTitle: title })

  // Restore session to provider.
  await switchUser(page, provider)

  return {
    serviceId,
    handshakeId,
    serviceDetailUrl: detailUrl,
    title,
    provider,
    requester,
  }
}

/**
 * Submit an evaluation directly via the API.
 * Call while logged in as the submitting user.
 * Useful as state setup when the submission itself is not the thing under test.
 */
export async function submitEvaluationViaApi(
  page: Page,
  options: {
    handshakeId: string
    punctual?: boolean
    helpful?: boolean
    kindness?: boolean
    is_late?: boolean
    is_unhelpful?: boolean
    is_rude?: boolean
    comment?: string
  },
): Promise<void> {
  const { handshakeId, comment } = options
  const hasPositive = options.punctual || options.helpful || options.kindness
  const hasNegative = options.is_late || options.is_unhelpful || options.is_rude

  if (hasPositive) {
    const result = await page.evaluate(async (data) => {
      const res = await fetch('/api/reputation/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return { ok: res.ok, status: res.status, body: await res.text() }
    }, {
      handshake_id: handshakeId,
      punctual: Boolean(options.punctual),
      helpful: Boolean(options.helpful),
      kindness: Boolean(options.kindness),
      ...(comment ? { comment } : {}),
    })
    expect(result.ok, `Submit positive eval failed: ${result.status} ${result.body}`).toBeTruthy()
  }

  if (hasNegative) {
    const result = await page.evaluate(async (data) => {
      const res = await fetch('/api/reputation/negative/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return { ok: res.ok, status: res.status, body: await res.text() }
    }, {
      handshake_id: handshakeId,
      is_late: Boolean(options.is_late),
      is_unhelpful: Boolean(options.is_unhelpful),
      is_rude: Boolean(options.is_rude),
      ...(comment ? { comment } : {}),
    })
    expect(result.ok, `Submit negative eval failed: ${result.status} ${result.body}`).toBeTruthy()
  }
}
