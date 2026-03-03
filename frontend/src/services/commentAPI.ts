import apiClient from './api'

export interface Comment {
  id: string
  service: string
  service_title?: string
  user_id: string
  user_name: string
  user_avatar_url?: string
  user_karma_score?: number
  user_badges?: string[]
  user_featured_achievement_id?: string | null
  parent?: string
  body: string
  is_deleted: boolean
  is_verified_review: boolean
  handshake_hours?: number
  handshake_completed_at?: string
  reply_count: number
  replies: CommentReply[]
  created_at: string
  updated_at: string
}

export interface CommentReply {
  id: string
  user_id: string
  user_name: string
  user_avatar_url?: string
  body: string
  is_deleted: boolean
  is_verified_review: boolean
  handshake_hours?: number
  handshake_completed_at?: string
  created_at: string
  updated_at: string
}

interface CommentsResponse {
  count: number
  next: string | null
  previous: string | null
  results: Comment[]
}

export const commentAPI = {
  list: async (serviceId: string, page?: number, signal?: AbortSignal): Promise<CommentsResponse> => {
    const params = page ? { page } : {}
    const res = await apiClient.get<CommentsResponse>(`/services/${serviceId}/comments/`, {
      params,
      signal,
    })
    return res.data
  },

  create: async (
    serviceId: string,
    body: string,
    parentId?: string,
    signal?: AbortSignal,
  ): Promise<Comment> => {
    const payload: { body: string; parent_id?: string } = { body }
    if (parentId) payload.parent_id = parentId
    const res = await apiClient.post<Comment>(`/services/${serviceId}/comments/`, payload, { signal })
    return res.data
  },

  delete: async (serviceId: string, commentId: string, signal?: AbortSignal): Promise<void> => {
    await apiClient.delete(`/services/${serviceId}/comments/${commentId}/`, { signal })
  },
}
