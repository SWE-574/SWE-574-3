/**
 * Public chat API – get and post to a public chat by id
 * GET /api/public-chat/{id}/, POST /api/public-chat/{id}/
 */

import { normalizeRuntimeUrl } from "../constants/env";
import { apiRequest } from './client';

export interface PublicChatRoom {
  id: string;
  name: string;
  type: string;
  related_service?: string;
  created_at?: string;
}

export interface PublicChatMessage {
  id: string;
  room?: string;
  sender_id?: string;
  sender_name?: string;
  sender_avatar_url?: string | null;
  body?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface PublicChatResponse {
  room?: PublicChatRoom;
  messages?: {
    count?: number;
    next?: string | null;
    previous?: string | null;
    results?: PublicChatMessage[];
  };
}

function normalizeMessage(message: PublicChatMessage): PublicChatMessage {
  return {
    ...message,
    sender_avatar_url: normalizeRuntimeUrl(message.sender_avatar_url),
  };
}

function normalizeResponse(response: PublicChatResponse): PublicChatResponse {
  return {
    ...response,
    messages: response.messages
      ? {
          ...response.messages,
          results: (response.messages.results ?? []).map(normalizeMessage),
        }
      : undefined,
  };
}

export function getPublicChat(id: string): Promise<PublicChatResponse> {
  return apiRequest<PublicChatResponse>(`/public-chat/${id}/`).then(normalizeResponse);
}

export function postPublicChat(
  id: string,
  body: { body: string; [key: string]: unknown },
): Promise<PublicChatMessage> {
  return apiRequest<PublicChatMessage>(`/public-chat/${id}/`, { method: 'POST', body }).then(
    normalizeMessage,
  );
}
