/**
 * WebSocket URL builders for chat – used for real-time chat messages.
 * Base is derived from the API BASE_URL (React Native has no window.location).
 */

import { BASE_URL, getAuthToken } from "./client";

const apiUrl = new URL(BASE_URL);
const wsProtocol = apiUrl.protocol === "https:" ? "wss" : "ws";
const wsBase = `${wsProtocol}://${apiUrl.host}`;

export const buildChatWsUrl = (id: string) => `${wsBase}/ws/chat/${id}/`;
export const buildGroupChatWsUrl = (id: string) => `${wsBase}/ws/group-chat/${id}/`;
export const buildEventChatWsUrl = (roomId: string) => `${wsBase}/ws/public-chat/${roomId}/`;

/** Append auth token to a WebSocket URL for authenticated connections. */
export function withAuthToken(wsUrl: string): string {
  const token = getAuthToken();
  if (!token) return wsUrl;
  const sep = wsUrl.includes("?") ? "&" : "?";
  return `${wsUrl}${sep}token=${encodeURIComponent(token)}`;
}
