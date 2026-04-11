import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChatMessage } from "../api/chatMessages";

export type ChatScreenParams = {
  handshakeId: string;
  serviceId?: string;
  otherUserName: string;
  serviceTitle?: string;
  otherUserId?: string;
  otherUserAvatarUrl?: string;
  isProvider?: boolean;
  serviceType?: string;
  scheduleType?: string;
  maxParticipants?: number;
  serviceLocationType?: string;
  serviceLocationArea?: string | null;
  serviceExactLocation?: string | null;
  serviceExactLocationMapsUrl?: string | null;
  serviceLocationGuide?: string | null;
  serviceScheduledTime?: string | null;
  provisionedHours?: number;
};

export type NavProps = NativeStackScreenProps<
  { Chat: ChatScreenParams },
  "Chat"
>;

export type ChatMessageWithMeta = ChatMessage & {
  sender?: string;
  sender_id?: string;
  sender_name?: string;
  sender_avatar_url?: string;
  handshake_id?: string;
  pending?: boolean;
};

export type HandshakeRole = "initiator" | "other" | "unknown";

export type ActionType =
  | "approve"
  | "decline"
  | "cancel"
  | "confirm"
  | "initiate"
  | "requestCancellation"
  | "approveCancellation"
  | "rejectCancellation"
  | "reportParticipant"
  | "submitEvaluation";
