import apiClient from './api'
import type { ForumCategory, ForumTopic } from '@/types'

export interface ForumTopicListParams {
  category?: string
  page?: number
  page_size?: number
  search?: string
}

export interface PaginatedResponse<T> {
  results: T[]
  count: number
  next: string | null
  previous: string | null
}

export const forumAPI = {
  /** List all active forum categories. */
  listCategories: async (signal?: AbortSignal): Promise<ForumCategory[]> => {
    const res = await apiClient.get<ForumCategory[] | PaginatedResponse<ForumCategory>>(
      '/forum/categories/',
      { signal },
    )
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  /** Get a single category by slug. */
  getCategory: async (slug: string, signal?: AbortSignal): Promise<ForumCategory> => {
    const res = await apiClient.get<ForumCategory>(`/forum/categories/${slug}/`, { signal })
    return res.data
  },

  /** List topics, optionally filtered by category slug. */
  listTopics: async (
    params: ForumTopicListParams,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<ForumTopic>> => {
    const res = await apiClient.get<PaginatedResponse<ForumTopic>>('/forum/topics/', {
      params,
      signal,
    })
    return res.data
  },

  /** Get a single topic by id. */
  getTopic: async (id: string, signal?: AbortSignal): Promise<ForumTopic> => {
    const res = await apiClient.get<ForumTopic>(`/forum/topics/${id}/`, { signal })
    return res.data
  },

  /** Create a new topic. */
  createTopic: async (
    data: { title: string; body: string; category: string },
    signal?: AbortSignal,
  ): Promise<ForumTopic> => {
    const res = await apiClient.post<ForumTopic>('/forum/topics/', data, { signal })
    return res.data
  },

  /** Create a reply (post) on a topic. */
  createPost: async (
    data: { topic: string; body: string },
    signal?: AbortSignal,
  ): Promise<{ id: string; body: string; created_at: string }> => {
    const res = await apiClient.post<{ id: string; body: string; created_at: string }>(
      '/forum/posts/',
      data,
      { signal },
    )
    return res.data
  },
}
