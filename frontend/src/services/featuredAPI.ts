import apiClient from './api'
import type { FeaturedResponse } from '@/types'

export const featuredAPI = {
  get: async (signal?: AbortSignal): Promise<FeaturedResponse> => {
    const res = await apiClient.get<FeaturedResponse>('/featured/', { signal })
    const data = res.data
    return {
      trending: data.trending ?? [],
      friends: data.friends ?? [],
      top_providers: data.top_providers ?? [],
    }
  },
}
