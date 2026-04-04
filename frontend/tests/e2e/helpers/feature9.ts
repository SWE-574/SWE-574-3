import { type Page } from '@playwright/test'

import { type DemoUser } from './auth'
import { createPendingOfferExchange, initiateOnlineHandshakeViaApi } from './feature8'
import { switchUser } from './session'

export async function createPendingOfferWithProposedDetails(page: Page, options: {
  owner: DemoUser
  requester: DemoUser
  title: string
  duration?: number
  meetingLink?: string
}): Promise<{
  title: string
  detailUrl: string
  serviceId: string
  handshakeId: string
}> {
  const pending = await createPendingOfferExchange(page, {
    owner: options.owner,
    requester: options.requester,
    title: options.title,
    duration: options.duration ?? 1,
  })

  await switchUser(page, options.owner)
  const handshakeId = await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: pending.title,
    requesterName: options.requester.name,
    duration: options.duration ?? 1,
    meetingLink: options.meetingLink,
  })

  return {
    ...pending,
    handshakeId,
  }
}
