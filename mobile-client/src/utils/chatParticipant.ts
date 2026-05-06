import type { Handshake } from "../api/handshakes";

const FALLBACK_PARTICIPANT_NAME = "Unknown";
const FALLBACK_PARTICIPANT_INITIAL = "?";

export interface ChatParticipantDisplay {
  name: string;
  userId?: string;
  avatarUrl?: string | null;
}

export function getChatParticipantLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || FALLBACK_PARTICIPANT_NAME;
}

export function getChatParticipantInitial(name: string | null | undefined): string {
  const label = getChatParticipantLabel(name);
  if (label === FALLBACK_PARTICIPANT_NAME) return FALLBACK_PARTICIPANT_INITIAL;
  return label.charAt(0).toUpperCase();
}

export function getChatParticipantDisplay({
  routeName,
  routeUserId,
  routeAvatarUrl,
  handshake,
}: {
  routeName?: string | null;
  routeUserId?: string | null;
  routeAvatarUrl?: string | null;
  handshake?: Handshake | null;
}): ChatParticipantDisplay {
  const counterpart = handshake?.counterpart;
  const counterpartName = [counterpart?.first_name, counterpart?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    name: getChatParticipantLabel(counterpartName || routeName),
    userId: counterpart?.id ?? routeUserId ?? undefined,
    avatarUrl: counterpart?.avatar_url ?? routeAvatarUrl ?? undefined,
  };
}

export function shouldShowChatParticipantLoading({
  handshakeId,
  routeName,
  handshake,
}: {
  handshakeId?: string | null;
  routeName?: string | null;
  handshake?: Handshake | null;
}): boolean {
  return Boolean(handshakeId && !handshake && !routeName?.trim());
}
