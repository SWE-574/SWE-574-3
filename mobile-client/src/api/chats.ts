/**
 * Chats API – list, create, retrieve
 * GET/POST /api/chats/, GET /api/chats/{id}/
 */

import { apiRequest } from "./client";

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

/**
 * Backend may return a plain array or a paginated object `{ count, results }`.
 * Always normalize to `Chat[]` so callers can safely use `.filter` / `.map`.
 */
export function listChats(params?: ChatsListParams): Promise<Chat[]> {
  return apiRequest<Chat[] | { results?: Chat[] }>(`/chats/`, {
    params: params as Record<string, string | number | undefined>,
  }).then((data) => {
    if (Array.isArray(data)) return data;
    if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as { results?: Chat[] }).results)
    ) {
      return (data as { results: Chat[] }).results;
    }
    return [];
  });
}

export function createChat(body?: CreateChatRequest): Promise<Chat> {
  return apiRequest<Chat>("/chats/", { method: "POST", body: body ?? {} });
}

export function getChat(id: string): Promise<Chat> {
  return apiRequest<Chat>(`/chats/${id}/`);
}

export function getGroupChat(id: string): Promise<Chat> {
  return apiRequest<Chat>(`/group-chat/${id}/`);
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
