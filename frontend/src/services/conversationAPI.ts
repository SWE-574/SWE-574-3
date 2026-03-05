import apiClient from './api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiChatMessage {
  id: string
  handshake: string
  handshake_id: string
  sender: string         // UUID
  sender_id: string
  sender_name: string
  sender_avatar_url: string | null
  body: string
  created_at: string
}

export interface PublicChatMessage {
  id: string
  room: string
  sender_id: string
  sender_name: string
  sender_avatar_url: string | null
  body: string
  created_at: string
}

interface PublicChatRoom {
  id: string
  name: string
  type: string
  related_service: string | null
  created_at: string
}

export interface ChatConversation {
  handshake_id: string
  service_id: string
  service_title: string
  service_type: string   // 'Offer' | 'Need'
  other_user: {
    id: string
    name: string
    avatar_url: string | null
  }
  last_message: ApiChatMessage | null
  status: string
  is_provider: boolean
  provider_confirmed_complete: boolean
  receiver_confirmed_complete: boolean
  provider_initiated: boolean
  requester_initiated: boolean
  evaluation_window_starts_at: string | null
  evaluation_window_ends_at: string | null
  evaluation_window_closed_at: string | null
  exact_location: string | null
  exact_duration: number | null
  scheduled_time: string | null
  provisioned_hours: number | null
  user_has_reviewed: boolean
  max_participants: number
  schedule_type: string  // 'One-Time' | 'Recurrent'
}

export interface GroupChatMessage {
  id: string
  service: string
  sender_id: string
  sender_name: string
  sender_avatar_url: string | null
  body: string
  created_at: string
}

interface MessagesResponse {
  count: number
  next: string | null
  previous: string | null
  results: ApiChatMessage[]
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const conversationAPI = {
  /**
   * GET /api/chats/ — list all conversations for the authenticated user.
   * Returns conversations ordered by most-recently-updated handshake.
   */
  listConversations: async (signal?: AbortSignal): Promise<ChatConversation[]> => {
    const res = await apiClient.get<ChatConversation[] | { results: ChatConversation[] }>(
      '/chats/',
      { signal },
    )
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  /**
   * GET /api/chats/:handshakeId/ — fetch messages for a conversation.
   * Backend returns newest-first; caller should reverse for chronological display.
   */
  getMessages: async (
    handshakeId: string,
    signal?: AbortSignal,
    pageSize = 50,
  ): Promise<ApiChatMessage[]> => {
    const res = await apiClient.get<MessagesResponse>(`/chats/${handshakeId}/`, {
      params: { page_size: pageSize },
      signal,
    })
    return res.data.results ?? []
  },

  /**
   * POST /api/chats/ — send a message.
   * Body: { handshake_id, body }
   */
  sendMessage: async (handshakeId: string, body: string): Promise<ApiChatMessage> => {
    const res = await apiClient.post<ApiChatMessage>('/chats/', {
      handshake_id: handshakeId,
      body,
    })
    return res.data
  },
}

export const groupChatAPI = {
  /**
   * GET /api/group-chat/{serviceId}/ — last 50 messages for the private group chat.
   * Only accessible to users with an accepted handshake (or the service owner).
   */
  getMessages: async (serviceId: string, signal?: AbortSignal): Promise<GroupChatMessage[]> => {
    const res = await apiClient.get<{ service_id: string; messages: GroupChatMessage[] }>(
      `/group-chat/${serviceId}/`,
      { signal },
    )
    return res.data.messages ?? []
  },

  /**
   * POST /api/group-chat/{serviceId}/ — send a message to the group chat.
   */
  sendMessage: async (serviceId: string, body: string): Promise<GroupChatMessage> => {
    const res = await apiClient.post<GroupChatMessage>(`/group-chat/${serviceId}/`, { body })
    return res.data
  },
}

// ─── Event Chat API (public chat rooms) ───────────────────────────────────────

export const eventChatAPI = {
  /**
   * GET /api/public-chat/{serviceId}/ — get room info and messages for an event.
   * Returns { room, messages: { count, next, previous, results } }.
   */
  getMessages: async (serviceId: string, signal?: AbortSignal): Promise<{ room: PublicChatRoom; messages: PublicChatMessage[] }> => {
    const res = await apiClient.get<{ room: PublicChatRoom; messages: { results: PublicChatMessage[] } }>(
      `/public-chat/${serviceId}/`,
      { signal },
    )
    return {
      room: res.data.room,
      messages: res.data.messages?.results ?? [],
    }
  },

  /**
   * POST /api/public-chat/{serviceId}/ — send a message to the event chat.
   */
  sendMessage: async (serviceId: string, body: string): Promise<PublicChatMessage> => {
    const res = await apiClient.post<PublicChatMessage>(`/public-chat/${serviceId}/`, { body })
    return res.data
  },
}

// Both dev and prod connect to the current host; the WS upgrade is forwarded
// by Vite's /ws proxy rule (dev) or Nginx (prod). This respects VITE_BACKEND_URL
// without hard-coding a port and works in Docker / LAN setups.
const wsBase = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`

export const buildChatWsUrl      = (id: string) => `${wsBase}/ws/chat/${id}/`
export const buildGroupChatWsUrl = (id: string) => `${wsBase}/ws/group-chat/${id}/`
export const buildEventChatWsUrl = (roomId: string) => `${wsBase}/ws/public-chat/${roomId}/`
