import apiClient from './api'
import type { Tag } from '@/types'

interface WikidataItem {
  id: string
  label: string
  description?: string
}

export const tagAPI = {
  /** Search Wikidata suggestions (may return QIDs not yet in local DB). */
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

  /** Search tags that already exist in the local DB. */
  searchLocal: async (query: string, signal?: AbortSignal): Promise<Tag[]> => {
    if (!query.trim()) return []
    const res = await apiClient.get<Tag[]>('/tags/', { params: { search: query }, signal })
    return res.data ?? []
  },

  /**
   * Ensure a tag with the given name exists in the DB.
   * Creates it if missing (POST /api/tags/), falls back to name search if 400.
   * Returns the canonical DB tag with a proper UUID id.
   */
  ensureInDb: async (name: string): Promise<Tag> => {
    try {
      const res = await apiClient.post<Tag>('/tags/', { name: name.trim() })
      return res.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400) {
        // Tag already exists — fetch it by name
        const results = await apiClient.get<Tag[]>('/tags/', { params: { search: name.trim() } })
        const exact = (results.data ?? []).find(
          (t) => t.name.toLowerCase() === name.trim().toLowerCase()
        )
        if (exact) return exact
      }
      throw err
    }
  },
}
