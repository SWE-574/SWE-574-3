export interface TimeActivityAgreement {
  id: string;
  service_id?: string | null;
  service_title: string;
  service_type?: string | null;
  schedule_type?: string | null;
  max_participants?: number | null;
  scheduled_time?: string | null;
  is_current_user_provider: boolean;
  counterpart_id?: string | null;
  counterpart_name: string;
  counterpart_avatar_url?: string | null;
  status: string;
  reserved_delta: number;
  expected_delta: number;
  note: string;
  participant_count?: number;
  participants?: TimeActivityAgreement[];
  is_grouped_multi_use?: boolean;
}

export interface TimeActivityTransaction {
  id: string;
  service_id?: string | null;
  transaction_type: string;
  service_type?: string | null;
  schedule_type?: string | null;
  max_participants?: number | null;
  is_current_user_provider?: boolean;
  amount: number;
  balance_after: number;
  created_at: string;
  service_title?: string | null;
  counterpart?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    avatar_url?: string | null;
  } | null;
  description?: string;
}

export interface GroupedTransactionRow<T extends TimeActivityTransaction = TimeActivityTransaction> {
  key: string;
  serviceId?: string | null;
  primary: T;
  items: T[];
  amount: number;
  balanceAfter: number;
  createdAt: string;
  counterpartLabel: string;
  counterpartId?: string | null;
  counterpartAvatarUrl?: string | null;
  description: string;
  isMultiUse: boolean;
  participantCount: number;
  participants?: TimeActivityAgreement[];
}

function isOneTimeGroupOffer(item: {
  service_id?: string | null;
  service_type?: string | null;
  schedule_type?: string | null;
  max_participants?: number | null;
}) {
  return (
    item.service_type === "Offer" &&
    item.schedule_type === "One-Time" &&
    (item.max_participants ?? 0) > 1 &&
    Boolean(item.service_id)
  );
}

function sessionKey(item: { service_id?: string | null; scheduled_time?: string | null }) {
  return `${item.service_id ?? "unknown"}:${item.scheduled_time ?? "fixed-session"}`;
}

function representativeDelta(values: number[]) {
  const nonZero = values.filter((value) => value !== 0);
  if (nonZero.length === 0) return 0;
  const positives = nonZero.filter((value) => value > 0);
  if (positives.length > 0) return Math.max(...positives);
  return Math.min(...nonZero);
}

export function groupActiveAgreements<T extends TimeActivityAgreement>(agreements: T[]): TimeActivityAgreement[] {
  const groups = new Map<string, T[]>();
  const output: T[] = [];

  for (const agreement of agreements) {
    if (!isOneTimeGroupOffer(agreement)) {
      output.push({
        ...agreement,
        participant_count: agreement.participant_count ?? 1,
        participants: agreement.participants ?? [agreement],
        is_grouped_multi_use: false,
      });
      continue;
    }

    const key = sessionKey(agreement);
    groups.set(key, [...(groups.get(key) ?? []), agreement]);
  }

  for (const [key, participants] of groups.entries()) {
    if (participants.length === 1) {
      const [single] = participants;
      output.push({
        ...single,
        participant_count: 1,
        participants: [single],
        is_grouped_multi_use: false,
      });
      continue;
    }

    const [primary] = participants;
    output.push({
      ...primary,
      id: `group:${key}`,
      counterpart_id: null,
      counterpart_name: `${participants.length} members`,
      counterpart_avatar_url: null,
      expected_delta: representativeDelta(participants.map((item) => item.expected_delta)),
      reserved_delta: representativeDelta(participants.map((item) => item.reserved_delta)),
      note: `${participants.length} members in this group session`,
      participant_count: participants.length,
      participants,
      is_grouped_multi_use: true,
    });
  }

  return output;
}

function isGroupOfferTransfer(transaction: TimeActivityTransaction) {
  return (
    isOneTimeGroupOffer(transaction) &&
    transaction.transaction_type === "transfer" &&
    transaction.is_current_user_provider === true
  );
}

export function groupTransactionRows<T extends TimeActivityTransaction>(
  transactions: T[],
  options: {
    counterpartLabel?: (transaction: T) => string;
    counterpartId?: (transaction: T) => string | null | undefined;
    counterpartAvatarUrl?: (transaction: T) => string | null | undefined;
    description?: (transaction: T) => string;
    participantCount?: (transaction: T) => number | null | undefined;
    participants?: (transaction: T) => TimeActivityAgreement[] | null | undefined;
  } = {},
): GroupedTransactionRow<T>[] {
  const groups = new Map<string, GroupedTransactionRow<T>>();

  for (const transaction of transactions) {
    const shouldGroup = isGroupOfferTransfer(transaction);
    const key = shouldGroup ? `group-offer-transfer:${sessionKey(transaction)}` : transaction.id;
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(transaction);
      const knownParticipantCount = options.participantCount?.(transaction);
      const knownParticipants = options.participants?.(transaction) ?? undefined;
      existing.createdAt = new Date(transaction.created_at).getTime() > new Date(existing.createdAt).getTime()
        ? transaction.created_at
        : existing.createdAt;
      existing.balanceAfter = transaction.balance_after;
      existing.amount = representativeDelta(existing.items.map((item) => item.amount));
      existing.participantCount = Math.max(existing.items.length, knownParticipantCount ?? 0);
      existing.participants = knownParticipants ?? existing.participants;
      existing.counterpartLabel = `${existing.participantCount} members`;
      existing.counterpartId = null;
      existing.counterpartAvatarUrl = null;
      existing.description = `Settled once for ${existing.participantCount} participants. Open details to view everyone in this session.`;
      existing.isMultiUse = true;
      continue;
    }

    const knownParticipantCount = shouldGroup ? Math.max(1, options.participantCount?.(transaction) ?? 1) : 1;
    const knownParticipants = shouldGroup ? options.participants?.(transaction) ?? undefined : undefined;

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
        : options.counterpartLabel?.(transaction) ?? "Time activity",
      counterpartId: shouldGroup && knownParticipantCount > 1
        ? null
        : options.counterpartId?.(transaction) ?? transaction.counterpart?.id ?? null,
      counterpartAvatarUrl: shouldGroup && knownParticipantCount > 1
        ? null
        : options.counterpartAvatarUrl?.(transaction) ?? transaction.counterpart?.avatar_url ?? null,
      description: shouldGroup && knownParticipantCount > 1
        ? `Settled once for ${knownParticipantCount} participants. Open details to view everyone in this session.`
        : options.description?.(transaction) ?? transaction.description ?? "",
      isMultiUse: shouldGroup && knownParticipantCount > 1,
      participantCount: knownParticipantCount,
      participants: knownParticipants,
    });
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function completedTransactionParticipantLabel() {
  return "Completed participant";
}

export function activeAgreementParticipantLabel(status: string) {
  if (status === "checked_in") return "Checked in";
  if (status === "attended") return "Attended";
  return "Session confirmed";
}
