import { apiClient } from './api'
import type { ForumActivity, ForumCategory, ForumTopic, ForumPost } from '@/types'

export type ForumReportType = 'inappropriate_content' | 'spam' | 'scam' | 'harassment' | 'other'
export type TopicSortOption = 'newest' | 'most_active'

interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export const forumAPI = {
  // ── Categories ────────────────────────────────────────────────────────────
  listCategories: async (signal?: AbortSignal): Promise<ForumCategory[]> => {
    const res = await apiClient.get<ForumCategory[]>('/forum/categories/', { signal })
    return res.data
  },

  getCategory: async (slug: string, signal?: AbortSignal): Promise<ForumCategory> => {
    const res = await apiClient.get<ForumCategory>(`/forum/categories/${slug}/`, { signal })
    return res.data
  },

  // ── Topics ────────────────────────────────────────────────────────────────
  listTopics: async (params: { category?: string; page?: number; page_size?: number; sort?: TopicSortOption } = {}, signal?: AbortSignal): Promise<PaginatedResponse<ForumTopic>> => {
    const res = await apiClient.get<PaginatedResponse<ForumTopic>>('/forum/topics/', { params, signal })
    return res.data
  },

  getMyActivity: async (signal?: AbortSignal): Promise<ForumActivity> => {
    const res = await apiClient.get<ForumActivity>('/forum/my-activity/', { signal })
    return res.data
  },

  getTopic: async (id: string, signal?: AbortSignal): Promise<ForumTopic> => {
    const res = await apiClient.get<ForumTopic>(`/forum/topics/${id}/`, { signal })
    return res.data
  },

  createTopic: async (payload: { title: string; body: string; category: string }): Promise<ForumTopic> => {
    const res = await apiClient.post<ForumTopic>('/forum/topics/', payload)
    return res.data
  },

  updateTopic: async (id: string, payload: { title?: string; body?: string }): Promise<ForumTopic> => {
    const res = await apiClient.patch<ForumTopic>(`/forum/topics/${id}/`, payload)
    return res.data
  },

  deleteTopic: async (id: string): Promise<void> => {
    await apiClient.delete(`/forum/topics/${id}/`)
  },

  pinTopic: async (id: string): Promise<ForumTopic> => {
    const res = await apiClient.post<ForumTopic>(`/forum/topics/${id}/pin/`)
    return res.data
  },

  lockTopic: async (id: string): Promise<ForumTopic> => {
    const res = await apiClient.post<ForumTopic>(`/forum/topics/${id}/lock/`)
    return res.data
  },

  reportTopic: async (id: string, type: ForumReportType, description = ''): Promise<void> => {
    await apiClient.post(`/forum/topics/${id}/report/`, { type, description })
  },

  listRecentPosts: async (
    params: { page?: number; page_size?: number } = {},
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<ForumPost>> => {
    const res = await apiClient.get<PaginatedResponse<ForumPost>>('/forum/posts/recent/', { params, signal })
    return res.data
  },

  // ── Posts ─────────────────────────────────────────────────────────────────
  listPosts: async (topicId: string, params: { page?: number; page_size?: number } = {}, signal?: AbortSignal): Promise<PaginatedResponse<ForumPost>> => {
    const res = await apiClient.get<PaginatedResponse<ForumPost>>(`/forum/topics/${topicId}/posts/`, { params, signal })
    return res.data
  },

  createPost: async (topicId: string, body: string): Promise<ForumPost> => {
    const res = await apiClient.post<ForumPost>(`/forum/topics/${topicId}/posts/`, { body })
    return res.data
  },

  updatePost: async (postId: string, body: string): Promise<ForumPost> => {
    const res = await apiClient.patch<ForumPost>(`/forum/posts/${postId}/`, { body })
    return res.data
  },

  deletePost: async (postId: string): Promise<void> => {
    await apiClient.delete(`/forum/posts/${postId}/`)
  },

  reportPost: async (postId: string, type: ForumReportType, description = ''): Promise<void> => {
    await apiClient.post(`/forum/posts/${postId}/report/`, { type, description })
  },
}
