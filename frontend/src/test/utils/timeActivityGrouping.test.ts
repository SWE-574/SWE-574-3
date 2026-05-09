import { describe, expect, it } from 'vitest'
import {
  groupActiveAgreements,
  groupTransactionRows,
  completedGroupOfferParticipantCount,
  completedGroupOfferParticipants,
  isTimeActivityParticipantStatus,
  timeActivityVisibleParticipants,
  transactionGroupDetailParticipants,
  type TimeActivityAgreement,
  type TimeActivityTransaction,
} from '@/utils/timeActivityGrouping'

const baseAgreement = {
  service_id: 'service-1',
  service_title: 'Neighborhood Manti Cooking Circle',
  service_type: 'Offer',
  schedule_type: 'One-Time',
  max_participants: 3,
  is_current_user_provider: true,
  status: 'accepted',
  provisioned_hours: 3,
  reserved_delta: 0,
  expected_delta: 3,
  note: 'Time expected after completion',
} satisfies Omit<TimeActivityAgreement, 'id' | 'counterpart_name'>

const baseTransaction = {
  transaction_type: 'transfer',
  service_id: 'service-1',
  service_title: 'Neighborhood Manti Cooking Circle',
  service_type: 'Offer',
  schedule_type: 'One-Time',
  max_participants: 3,
  is_current_user_provider: true,
  amount: 3,
  balance_after: 10,
  created_at: '2026-05-09T10:00:00Z',
  description: 'Completed exchange',
} satisfies Omit<TimeActivityTransaction, 'id'>

describe('timeActivityGrouping', () => {
  it('groups active one-time group offer agreements by service session', () => {
    const grouped = groupActiveAgreements([
      { ...baseAgreement, id: 'hs-1', counterpart_name: 'Can Sahin' },
      { ...baseAgreement, id: 'hs-2', counterpart_name: 'Zeynep Arslan' },
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      service_id: 'service-1',
      counterpart_name: '2 members',
      participant_count: 2,
      expected_delta: 3,
      reserved_delta: 0,
      is_grouped_multi_use: true,
    })
    expect(grouped[0].participants.map((item) => item.counterpart_name)).toEqual([
      'Can Sahin',
      'Zeynep Arslan',
    ])
  })

  it('keeps one-to-one active agreements as individual rows', () => {
    const grouped = groupActiveAgreements([
      {
        ...baseAgreement,
        id: 'hs-1',
        service_id: 'solo-service',
        max_participants: 1,
        counterpart_name: 'Can Sahin',
      },
      {
        ...baseAgreement,
        id: 'hs-2',
        service_id: 'another-service',
        max_participants: 1,
        counterpart_name: 'Zeynep Arslan',
      },
    ])

    expect(grouped).toHaveLength(2)
    expect(grouped.every((item) => item.participant_count === 1)).toBe(true)
  })

  it('groups completed one-time group offer transfer rows without summing duplicate provider credit', () => {
    const grouped = groupTransactionRows([
      { ...baseTransaction, id: 'tx-1' },
      { ...baseTransaction, id: 'tx-2', created_at: '2026-05-09T11:00:00Z' },
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      serviceId: 'service-1',
      amount: 3,
      participantCount: 2,
      isMultiUse: true,
    })
    expect(grouped[0].items).toHaveLength(2)
  })

  it('marks a single visible group offer transfer as a grouped activity row when participant count is known', () => {
    const grouped = groupTransactionRows(
      [{ ...baseTransaction, id: 'tx-1' }],
      {
        participantCount: () => 2,
        participants: () => [
          { ...baseAgreement, id: 'hs-1', counterpart_name: 'Can Sahin', counterpart_avatar_url: 'can.jpg' },
          { ...baseAgreement, id: 'hs-2', counterpart_name: 'Zeynep Arslan', counterpart_avatar_url: 'zeynep.jpg' },
        ],
      },
    )

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      counterpartLabel: '2 members',
      participantCount: 2,
      isMultiUse: true,
    })
    expect(grouped[0].participants?.map((item) => item.counterpart_avatar_url)).toEqual([
      'can.jpg',
      'zeynep.jpg',
    ])
  })

  it('does not duplicate active fallback participants when completed details exist', () => {
    const completedParticipants = [
      { id: 'completed-1', title: 'Can Sahin' },
      { id: 'completed-2', title: 'Zeynep Arslan' },
    ]
    const activeFallback = [
      { id: 'active-1', title: 'Can Sahin' },
      { id: 'active-2', title: 'Zeynep Arslan' },
    ]

    expect(transactionGroupDetailParticipants(completedParticipants, activeFallback)).toEqual(completedParticipants)
  })

  it('uses completed participant count over active session count for completed group transfer rows', () => {
    expect(completedGroupOfferParticipantCount({ participantCount: 5, completedCount: 3 })).toBe(3)
    expect(completedGroupOfferParticipantCount({ participantCount: 2, completedCount: 0 })).toBe(2)
  })

  it('uses completed participant avatars over active session avatars for completed group transfer rows', () => {
    const participants = [
      { ...baseAgreement, id: 'accepted-1', counterpart_name: 'Accepted One', status: 'accepted' as const },
      { ...baseAgreement, id: 'accepted-2', counterpart_name: 'Accepted Two', status: 'accepted' as const },
      { ...baseAgreement, id: 'completed-1', counterpart_name: 'Completed One', status: 'completed' as const },
    ]
    const completedParticipants = participants.filter((item) => item.status === 'completed')

    expect(completedGroupOfferParticipants({ participants, completedParticipants }).map((item) => item.id)).toEqual([
      'completed-1',
    ])
  })

  it('excludes inactive handshake statuses from group offer participant displays', () => {
    expect(isTimeActivityParticipantStatus('accepted')).toBe(true)
    expect(isTimeActivityParticipantStatus('completed')).toBe(true)
    expect(isTimeActivityParticipantStatus('declined')).toBe(false)
    expect(isTimeActivityParticipantStatus('cancelled')).toBe(false)
  })

  it('keeps all participant avatars visible instead of capping at two', () => {
    const participants = [
      { ...baseAgreement, id: 'hs-1', counterpart_name: 'Can Sahin' },
      { ...baseAgreement, id: 'hs-2', counterpart_name: 'Zeynep Arslan' },
      { ...baseAgreement, id: 'hs-3', counterpart_name: 'Ayse Kaya' },
    ]

    expect(timeActivityVisibleParticipants(participants).map((item) => item.id)).toEqual([
      'hs-1',
      'hs-2',
      'hs-3',
    ])
  })
})
