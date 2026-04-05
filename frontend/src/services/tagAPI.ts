import apiClient from './api'
import type { Tag } from '@/types'

interface WikidataItem {
  id: string
  label: string
  description?: string
  entity_type?: string | null
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
        description: item.description ?? undefined,
        entity_type: item.entity_type ?? undefined,
      }))
  },

  /** Search tags that already exist in the local DB. */
  searchLocal: async (query: string, signal?: AbortSignal): Promise<Tag[]> => {
    if (!query.trim()) return []
    const res = await apiClient.get<Tag[]>('/tags/', { params: { search: query }, signal })
    return res.data ?? []
  },

  /**
   * Ensure a tag with the given Wikidata QID exists in the DB.
   * Creates it if missing (POST /api/tags/), falls back to fetch if already exists.
   * Returns the canonical DB tag.
   */
  ensureInDb: async (tag: Tag): Promise<Tag> => {
    try {
      const res = await apiClient.post<Tag>('/tags/', { id: tag.id, name: tag.name.trim() })
      return res.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400) {
        // Tag already exists — fetch it by ID or name
        const results = await apiClient.get<Tag[]>('/tags/', { params: { search: tag.name.trim() } })
        const exact = (results.data ?? []).find(
          (t) => t.id === tag.id || t.name.toLowerCase() === tag.name.trim().toLowerCase()
        )
        if (exact) return exact
      }
      throw err
    }
  },
}
