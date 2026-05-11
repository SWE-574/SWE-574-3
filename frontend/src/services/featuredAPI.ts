import apiClient from './api'
import type { FeaturedChipsResponse } from '@/types'

export const featuredAPI = {
  getChips: async (signal?: AbortSignal): Promise<FeaturedChipsResponse> => {
    const res = await apiClient.get<FeaturedChipsResponse>('/featured/chips/', { signal })
    return { chips: res.data.chips ?? [] }
  },
}
