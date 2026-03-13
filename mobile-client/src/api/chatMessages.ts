/**
 * Shared types for chat messages (1:1, group, public).
 * WebSocket payloads may use body or content; we normalize for display.
 */

/** API message shape (element of data.results from chat messages endpoint). */
export interface ChatMessageApi {
  id: string;
  handshake?: string;
  handshake_id?: string;
  sender?: string;
  sender_id?: string;
  sender_name?: string;
  sender_avatar_url?: string | null;
  body: string;
  created_at: string;
  [key: string]: unknown;
}

/** Paginated response for chat messages (data.results). */
export interface ChatMessagesResponse {
  results: ChatMessageApi[];
  count?: number;
  next?: string | null;
  previous?: string | null;
}

export interface ChatMessage {
  id: string;
  sender_id?: string;
  sender_name?: string;
  body?: string;
  content?: string;
  created_at: string;
  type?: string;
  [key: string]: unknown;
}

export function normalizeMessage(raw: Record<string, unknown>): ChatMessage {
  const id =
    typeof raw.id === "string"
      ? raw.id
      : typeof raw.id === "number"
        ? String(raw.id)
        : "";
  const body =
    typeof raw.body === "string"
      ? raw.body
      : typeof raw.content === "string"
        ? raw.content
        : "";
  const created_at =
    typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString();
  const author = raw.author;
  const sender_name =
    typeof raw.sender_name === "string"
      ? raw.sender_name
      : author && typeof author === "object" && "username" in author
        ? String((author as { username: string }).username)
        : typeof author === "string"
          ? author
          : undefined;
  return {
    id,
    sender_id: raw.sender_id as string | undefined,
    sender_name,
    body,
    content: body,
    created_at,
    type: raw.type as string | undefined,
    ...raw,
  };
}
