/**
 * Public chat API – get and post to a public chat by id
 * GET /api/public-chat/{id}/, POST /api/public-chat/{id}/
 */

import { apiRequest } from './client';

export interface PublicChatMessage {
  id?: string;
  content?: string;
  author?: string | object;
  created_at?: string;
  [key: string]: unknown;
}

export function getPublicChat(id: string): Promise<PublicChatMessage[] | { messages: PublicChatMessage[] }> {
  return apiRequest(`/public-chat/${id}/`);
}

export function postPublicChat(id: string, body: { content?: string; [key: string]: unknown }): Promise<PublicChatMessage> {
  return apiRequest<PublicChatMessage>(`/public-chat/${id}/`, { method: 'POST', body });
}
