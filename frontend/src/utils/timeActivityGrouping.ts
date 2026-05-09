import type { Handshake } from '@/services/handshakeAPI'
import type { Transaction } from '@/types'

export interface TimeActivityAgreement {
  id: string
  service_id?: string | null
  service_title: string
  service_type?: Handshake['service_type']
  schedule_type?: Handshake['schedule_type'] | null
  max_participants?: number | null
  scheduled_time?: string | null
  is_current_user_provider: boolean
  counterpart_id?: string | null
  counterpart_name: string
  counterpart_email?: string
  counterpart_avatar_url?: string | null
  status: Handshake['status']
  provisioned_hours?: number
  reserved_delta: number
  expected_delta: number
  note: string
  participant_count?: number
  participants?: TimeActivityAgreement[]
  is_grouped_multi_use?: boolean
}

export interface TimeActivityTransaction {
  id: string
  service_id?: string | null
  transaction_type: Transaction['transaction_type'] | string
  service_type?: Transaction['service_type']
  schedule_type?: Transaction['schedule_type']
  max_participants?: number | null
  is_current_user_provider?: boolean
  amount: number
  balance_after: number
  created_at: string
  service_title?: string | null
  counterpart?: Transaction['counterpart']
  description?: string
}

export interface GroupedTransactionRow<T extends TimeActivityTransaction = TimeActivityTransaction> {
  key: string
  serviceId?: string | null
  primary: T
  items: T[]
  amount: number
  balanceAfter: number
  createdAt: string
  counterpartLabel: string
  counterpartId?: string | null
  counterpartAvatarUrl?: string | null
  description: string
  isMultiUse: boolean
  participantCount: number
  participants?: TimeActivityAgreement[]
}

function isOneTimeGroupOffer(item: {
  service_id?: string | null
  service_type?: string | null
  schedule_type?: string | null
  max_participants?: number | null
}) {
  return (
    item.service_type === 'Offer'
    && item.schedule_type === 'One-Time'
    && (item.max_participants ?? 0) > 1
    && Boolean(item.service_id)
  )
}

function sessionKey(item: { service_id?: string | null; scheduled_time?: string | null }) {
  return `${item.service_id ?? 'unknown'}:${item.scheduled_time ?? 'fixed-session'}`
}

function representativeDelta(values: number[]) {
  const nonZero = values.filter((value) => value !== 0)
  if (nonZero.length === 0) return 0
  // Group-offer rows represent one shared session, so we keep one representative
  // participant delta instead of summing duplicate provider-side transfer rows.
  const positives = nonZero.filter((value) => value > 0)
  if (positives.length > 0) return Math.max(...positives)
  return Math.min(...nonZero)
}

export function isTimeActivityParticipantStatus(status?: string | null) {
  return status === 'accepted' || status === 'checked_in' || status === 'attended' || status === 'completed'
}

export function completedGroupOfferParticipantCount({
  participantCount,
  completedCount,
}: {
  participantCount?: number | null
  completedCount?: number | null
}) {
  return completedCount && completedCount > 0 ? completedCount : participantCount ?? null
}

export function completedGroupOfferParticipants<T>({
  participants,
  completedParticipants,
}: {
  participants?: T[] | null
  completedParticipants?: T[] | null
}) {
  return completedParticipants && completedParticipants.length > 0
    ? completedParticipants
    : participants
}

export function timeActivityVisibleParticipants<T>(participants?: T[] | null): T[] {
  return participants ?? []
}

export function groupActiveAgreements<T extends TimeActivityAgreement>(agreements: T[]): TimeActivityAgreement[] {
  const groups = new Map<string, T[]>()
  const output: T[] = []

  for (const agreement of agreements) {
    if (!isOneTimeGroupOffer(agreement)) {
      output.push({
        ...agreement,
        participant_count: agreement.participant_count ?? 1,
        participants: agreement.participants ?? [agreement],
        is_grouped_multi_use: false,
      })
      continue
    }

    const key = sessionKey(agreement)
    groups.set(key, [...(groups.get(key) ?? []), agreement])
  }

  for (const [key, participants] of groups.entries()) {
    if (participants.length === 1) {
      const [single] = participants
      output.push({
        ...single,
        participant_count: 1,
        participants: [single],
        is_grouped_multi_use: false,
      })
      continue
    }

    const [primary] = participants
    output.push({
      ...primary,
      id: `group:${key}`,
      counterpart_id: null,
      counterpart_name: `${participants.length} members`,
      counterpart_email: '',
      counterpart_avatar_url: null,
      expected_delta: representativeDelta(participants.map((item) => item.expected_delta)),
      reserved_delta: representativeDelta(participants.map((item) => item.reserved_delta)),
      note: `${participants.length} members in this group session`,
      participant_count: participants.length,
      participants,
      is_grouped_multi_use: true,
    })
  }

  return output
}

function isGroupOfferTransfer(transaction: TimeActivityTransaction) {
  return (
    isOneTimeGroupOffer(transaction)
    && transaction.transaction_type === 'transfer'
    && transaction.is_current_user_provider === true
  )
}

export function groupTransactionRows<T extends TimeActivityTransaction>(
  transactions: T[],
  options: {
    counterpartLabel?: (transaction: T) => string
    counterpartId?: (transaction: T) => string | null | undefined
    counterpartAvatarUrl?: (transaction: T) => string | null | undefined
    description?: (transaction: T) => string
    participantCount?: (transaction: T) => number | null | undefined
    participants?: (transaction: T) => TimeActivityAgreement[] | null | undefined
  } = {},
): GroupedTransactionRow<T>[] {
  const groups = new Map<string, GroupedTransactionRow<T>>()

  for (const transaction of transactions) {
    const shouldGroup = isGroupOfferTransfer(transaction)
    const key = shouldGroup ? `group-offer-transfer:${sessionKey(transaction)}` : transaction.id
    const existing = groups.get(key)

    if (existing) {
      existing.items.push(transaction)
      const knownParticipantCount = options.participantCount?.(transaction)
      const knownParticipants = options.participants?.(transaction) ?? undefined
      existing.createdAt = new Date(transaction.created_at).getTime() > new Date(existing.createdAt).getTime()
        ? transaction.created_at
        : existing.createdAt
      existing.balanceAfter = transaction.balance_after
      existing.amount = representativeDelta(existing.items.map((item) => item.amount))
      existing.participantCount = Math.max(existing.items.length, knownParticipantCount ?? 0)
      existing.participants = knownParticipants ?? existing.participants
      existing.counterpartLabel = `${existing.participantCount} members`
      existing.counterpartId = null
      existing.counterpartAvatarUrl = null
      existing.description = `Settled once for ${existing.participantCount} participants. Open details to view everyone in this session.`
      existing.isMultiUse = true
      continue
    }

    const knownParticipantCount = shouldGroup ? Math.max(1, options.participantCount?.(transaction) ?? 1) : 1
    const knownParticipants = shouldGroup ? options.participants?.(transaction) ?? undefined : undefined

    groups.set(key, {
      key,
      serviceId: transaction.service_id,
      primary: transaction,
      items: [transaction],
      amount: transaction.amount,
      balanceAfter: transaction.balance_after,
      createdAt: transaction.created_at,
      counterpartLabel: shouldGroup && knownParticipantCount > 1
        ? `${knownParticipantCount} members`
        : options.counterpartLabel?.(transaction) ?? 'Time activity',
      counterpartId: shouldGroup && knownParticipantCount > 1
        ? null
        : options.counterpartId?.(transaction) ?? transaction.counterpart?.id ?? null,
      counterpartAvatarUrl: shouldGroup && knownParticipantCount > 1
        ? null
        : options.counterpartAvatarUrl?.(transaction) ?? transaction.counterpart?.avatar_url ?? null,
      description: shouldGroup && knownParticipantCount > 1
        ? `Settled once for ${knownParticipantCount} participants. Open details to view everyone in this session.`
        : options.description?.(transaction) ?? transaction.description ?? '',
      isMultiUse: shouldGroup && knownParticipantCount > 1,
      participantCount: knownParticipantCount,
      participants: knownParticipants,
    })
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export function transactionGroupDetailParticipants<TCompleted, TFallback>(
  completedParticipants: TCompleted[],
  fallbackParticipants: TFallback[],
): Array<TCompleted | TFallback> {
  return completedParticipants.length > 0 ? completedParticipants : fallbackParticipants
}
