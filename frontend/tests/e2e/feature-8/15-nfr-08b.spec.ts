import { test, expect } from '@playwright/test'

import {
  createPendingOfferExchange,
  findHandshakeId,
  initiateOnlineHandshakeViaApi,
  pickUsersWithBalanceAtLeast,
  postHandshakeAction,
  switchUser,
  USERS,
} from '../helpers'

test('NFR-08b: only handshake parties can execute state-changing exchange actions', async ({ page }) => {
  const owner = USERS.elif
  const picked = await pickUsersWithBalanceAtLeast(page, 2, 2, [owner.email])
  const requester = picked[0].user
  const stranger = picked[1].user
  const title = `NFR-08b Offer ${Date.now()}`

  await createPendingOfferExchange(page, {
    owner,
    requester,
    title,
    duration: 1,
  })

  const handshakeId = await findHandshakeId(page, {
    serviceTitle: title,
    requesterName: requester.name,
    status: 'pending',
  })

  // A third party must not be able to initiate or cancel someone else's pending exchange.
  await switchUser(page, stranger)
  const strangerInitiate = await postHandshakeAction(page, handshakeId, 'initiate', {
    exact_location: 'https://meet.example.com/nfr-08b',
    exact_duration: 1,
    scheduled_time: '2027-12-20T10:00:00',
  })
  expect([403, 404]).toContain(strangerInitiate.status)

  const strangerCancel = await postHandshakeAction(page, handshakeId, 'cancel')
  expect([403, 404]).toContain(strangerCancel.status)

  // After the owner initiates, only the requester should be allowed to approve.
  await switchUser(page, owner)
  await initiateOnlineHandshakeViaApi(page, {
    serviceTitle: title,
    requesterName: requester.name,
    duration: 1,
    meetingLink: 'https://meet.example.com/nfr-08b',
  })

  await switchUser(page, stranger)
  const strangerApprove = await postHandshakeAction(page, handshakeId, 'approve')
  expect([403, 404]).toContain(strangerApprove.status)

  await switchUser(page, requester)
  const requesterApprove = await postHandshakeAction(page, handshakeId, 'approve')
  expect(requesterApprove.ok).toBeTruthy()

  // Even after acceptance, a third party must still be blocked from confirming completion.
  await switchUser(page, stranger)
  const strangerConfirm = await postHandshakeAction(page, handshakeId, 'confirm')
  expect([403, 404]).toContain(strangerConfirm.status)
})
