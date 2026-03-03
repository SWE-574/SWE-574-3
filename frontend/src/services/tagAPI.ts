import apiClient from './api'
import type { Tag } from '@/types'

interface WikidataItem {
  id: string
  label: string
  description?: string
}

export const tagAPI = {
  search: async (query: string, signal?: AbortSignal): Promise<Tag[]> => {
    if (!query.trim()) return []

    const res = await apiClient.get<WikidataItem[]>('/wikidata/search/', {
      params: { q: query, limit: 10 },
      signal,
    })

    return (res.data ?? [])
      .filter((item) => item?.id && item?.label)
      .map((item) => ({
        id: item.id,
        name: item.label,
      }))
  },
}
