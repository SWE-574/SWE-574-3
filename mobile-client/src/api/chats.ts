/**
 * Chats API – list, create, retrieve
 * GET/POST /api/chats/, GET /api/chats/{id}/
 */

import { apiRequest } from "./client";
import { normalizeRuntimeUrl } from "../constants/env";

export interface Chat {
  handshake_id: string;
  service_id: string;
  service_title: string;
  service_type: string;
  other_user: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  last_message: {
    id: string;
    handshake: string;
    handshake_id: string;
    sender: string;
    sender_id: string;
    sender_name: string;
    sender_avatar_url: string | null;
    body: string;
    created_at: string;
  };
  status: string;
  provider_confirmed_complete: boolean;
  receiver_confirmed_complete: boolean;
  is_provider: boolean;
  provider_initiated: boolean;
  requester_initiated: boolean;
  exact_location: string;
  exact_duration: number;
  scheduled_time: string;
  provisioned_hours: number;
  user_has_reviewed: boolean;
  evaluation_window_starts_at?: string | null;
  evaluation_window_ends_at?: string | null;
  evaluation_window_closed_at?: string | null;
  max_participants: number;
  schedule_type: string;
  service_location_type?: string;
  service_location_area?: string | null;
  service_exact_location?: string | null;
  service_exact_location_maps_url?: string | null;
  service_location_guide?: string | null;
  service_scheduled_time?: string | null;
  /** Owner + accepted members; from GET /chats/ */
  service_member_count?: number;
  updated_at?: string;
}

export interface CreateChatRequest {
  [key: string]: unknown;
}

export interface ChatsListParams {
  page?: number;
  page_size?: number;
}

export interface GroupChatParticipant {
  id: string;
  name?: string;
  avatar_url?: string | null;
}

export interface GroupChatThread {
  service_id: string;
  service_title?: string;
  participants?: GroupChatParticipant[];
  messages?: Record<string, unknown>[];
  session_id?: string;
  scheduled_time?: string;
}

/** Rewrite the `/media/...` avatar paths the API returns into absolute URLs
 * the mobile client can actually load (otherwise the messages list shows
 * empty grey circles). Defensive against partial payloads — fields that
 * weren't in the response stay missing rather than being conjured. */
function normalizeChat(chat: Chat): Chat {
  const out: Chat = { ...chat };
  if (chat.other_user) {
    out.other_user = {
      ...chat.other_user,
      avatar_url: normalizeRuntimeUrl(chat.other_user.avatar_url) ?? null,
    };
  }
  if (chat.last_message) {
    out.last_message = {
      ...chat.last_message,
      sender_avatar_url:
        normalizeRuntimeUrl(chat.last_message.sender_avatar_url) ?? null,
    };
  }
  return out;
}

/**
 * Backend may return a plain array or a paginated object `{ count, results }`.
 * Always normalize to `Chat[]` so callers can safely use `.filter` / `.map`.
 */
export function listChats(params?: ChatsListParams): Promise<Chat[]> {
  return apiRequest<Chat[] | { results?: Chat[] }>(`/chats/`, {
    params: params as Record<string, string | number | undefined>,
  }).then((data) => {
    let chats: Chat[];
    if (Array.isArray(data)) {
      chats = data;
    } else if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as { results?: Chat[] }).results)
    ) {
      chats = (data as { results: Chat[] }).results;
    } else {
      chats = [];
    }
    return chats.map(normalizeChat);
  });
}

export async function createChat(body?: CreateChatRequest): Promise<Chat> {
  const res = await apiRequest<Chat>("/chats/", { method: "POST", body: body ?? {} });
  return normalizeChat(res);
}

export async function getChat(id: string): Promise<Chat> {
  const res = await apiRequest<Chat>(`/chats/${id}/`);
  return normalizeChat(res);
}

function normalizeGroupParticipant(
  participant: GroupChatParticipant,
): GroupChatParticipant {
  return {
    ...participant,
    avatar_url: normalizeRuntimeUrl(participant.avatar_url),
  };
}

export function getGroupChat(id: string): Promise<GroupChatThread> {
  return apiRequest<GroupChatThread>(`/group-chat/${id}/`).then((data) => ({
    ...data,
    participants: (data.participants ?? []).map(normalizeGroupParticipant),
  }));
}

export function sendGroupChatMessage(
  id: string,
  body: string,
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/group-chat/${id}/`, {
    method: "POST",
    body: { body },
  });
}
