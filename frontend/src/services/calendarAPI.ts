import apiClient from './api'
import type { CalendarResponse } from '@/types'

export const calendarAPI = {
  fetchUpcoming: async (
    params: { from?: string; to?: string } = {},
    signal?: AbortSignal,
  ): Promise<CalendarResponse> => {
    const res = await apiClient.get<CalendarResponse>('/users/me/calendar/', { params, signal })
    return res.data
  },
}
