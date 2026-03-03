import apiClient from './api'
import type { Tag } from '@/types'

export const tagAPI = {
  search: async (query: string, signal?: AbortSignal): Promise<Tag[]> => {
    const res = await apiClient.get<Tag[] | { results: Tag[] }>('/tags/', {
      params: { search: query },
      signal,
    })
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  create: async (name: string): Promise<Tag> => {
    const res = await apiClient.post<Tag>('/tags/', { name })
    return res.data
  },
}
