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
  max_participants: number;
  schedule_type: string;
}

export interface CreateChatRequest {
  [key: string]: unknown;
}

export interface ChatsListParams {
  page?: number;
  page_size?: number;
}

export function listChats(params?: ChatsListParams): Promise<Chat[]> {
  return apiRequest(`/chats/`, {
    params: params as Record<string, string | number | undefined>,
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
