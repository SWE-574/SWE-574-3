import { apiClient } from './api'
import type { AdminAuditLog, AdminComment, AdminMetrics, AdminReport, AdminSettings, AdminTransaction, AdminUserDetail, AdminUserSummary, PaginatedResponse } from '@/types'

export type ReportStatusFilter = 'pending' | 'resolved' | 'dismissed'
export type CommentStatusFilter = 'active' | 'removed' | 'all'
export type AuditTargetFilter = 'user' | 'report' | 'handshake' | 'comment' | 'forum_topic' | 'all'
export type ReportResolveAction =
  | 'confirm_no_show'
  | 'dismiss'
  | 'remove_from_event'
  | 'uphold_no_show'
  | 'overturn_no_show'

function toPaginated<T>(data: PaginatedResponse<T> | T[]): PaginatedResponse<T> {
  if (Array.isArray(data)) {
    return {
      results: data,
      count: data.length,
      next: null,
      previous: null,
    }
  }

  return data
}

export const adminAPI = {
  getSettings: async (signal?: AbortSignal): Promise<AdminSettings> => {
    const res = await apiClient.get<AdminSettings>('/admin/settings/', { signal })
    return res.data
  },

  updateSettings: async (payload: Partial<AdminSettings>, signal?: AbortSignal): Promise<AdminSettings> => {
    const res = await apiClient.patch<AdminSettings>('/admin/settings/', payload, { signal })
    return res.data
  },

  getMetrics: async (signal?: AbortSignal): Promise<AdminMetrics> => {
    const res = await apiClient.get<AdminMetrics>('/metrics/', { signal })
    return res.data
  },

  getReports: async (
    status: ReportStatusFilter = 'pending',
    page = 1,
    pageSize = 20,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<AdminReport>> => {
    const res = await apiClient.get<PaginatedResponse<AdminReport> | AdminReport[]>('/admin/reports/', {
      // Cache-bust to avoid stale status rows after moderation actions.
      params: { status, page, page_size: pageSize, _t: Date.now() },
      signal,
    })
    return toPaginated(res.data)
  },

  getReport: async (id: string, signal?: AbortSignal): Promise<AdminReport> => {
    const res = await apiClient.get<AdminReport>(`/admin/reports/${id}/`, { signal })
    return res.data
  },

  resolveReport: async (
    reportId: string,
    action: ReportResolveAction,
    adminNotes?: string,
    signal?: AbortSignal,
  ): Promise<AdminReport> => {
    const res = await apiClient.post<AdminReport>(
      `/admin/reports/${reportId}/resolve/`,
      { action, admin_notes: adminNotes ?? '' },
      { signal },
    )
    return res.data
  },

  pauseHandshake: async (
    reportId: string,
    signal?: AbortSignal,
  ): Promise<{ status: string; message: string; handshake_status: string }> => {
    const res = await apiClient.post<{ status: string; message: string; handshake_status: string }>(
      `/admin/reports/${reportId}/pause/`,
      {},
      { signal },
    )
    return res.data
  },

  getUsers: async (
    search?: string,
    status?: 'active' | 'banned',
    page = 1,
    pageSize = 20,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<AdminUserSummary>> => {
    const res = await apiClient.get<PaginatedResponse<AdminUserSummary> | AdminUserSummary[]>('/admin/users/', {
      params: {
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: pageSize,
      },
      signal,
    })

    return toPaginated(res.data)
  },

  getUserDetail: async (userId: string, signal?: AbortSignal): Promise<AdminUserDetail> => {
    const res = await apiClient.get<AdminUserDetail>(`/admin/users/${userId}/`, { signal })
    return res.data
  },

  getUserTransactions: async (
    userId: string,
    page = 1,
    pageSize = 20,
    signal?: AbortSignal,
  ): Promise<{ count: number; page: number; page_size: number; results: AdminTransaction[] }> => {
    const res = await apiClient.get(`/admin/users/${userId}/transactions/`, {
      params: { page, page_size: pageSize },
      signal,
    })
    return res.data
  },

  warnUser: async (
    userId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<{ status: string; message: string }> => {
    const res = await apiClient.post<{ status: string; message: string }>(
      `/admin/users/${userId}/warn/`,
      { message },
      { signal },
    )
    return res.data
  },

  banUser: async (
    userId: string,
    signal?: AbortSignal,
  ): Promise<{ status: string; message: string }> => {
    const res = await apiClient.post<{ status: string; message: string }>(
      `/admin/users/${userId}/ban/`,
      {},
      { signal },
    )
    return res.data
  },

  unbanUser: async (
    userId: string,
    signal?: AbortSignal,
  ): Promise<{ status: string; message: string }> => {
    const res = await apiClient.post<{ status: string; message: string }>(
      `/admin/users/${userId}/unban/`,
      {},
      { signal },
    )
    return res.data
  },

  adjustKarma: async (
    userId: string,
    adjustment: number,
    signal?: AbortSignal,
  ): Promise<{ status: string; message: string; new_karma: number }> => {
    const res = await apiClient.post<{ status: string; message: string; new_karma: number }>(
      `/admin/users/${userId}/adjust-karma/`,
      { adjustment },
      { signal },
    )
    return res.data
  },

  assignUserRole: async (
    userId: string,
    newRole: string,
    signal?: AbortSignal,
  ): Promise<{ status: string; message: string; previous_role: string; new_role: string }> => {
    const res = await apiClient.post<{
      status: string
      message: string
      previous_role: string
      new_role: string
    }>(`/admin/users/${userId}/assign-role/`, { role: newRole }, { signal })
    return res.data
  },

  getComments: async (
    status: CommentStatusFilter = 'active',
    page = 1,
    pageSize = 20,
    search?: string,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<AdminComment>> => {
    const res = await apiClient.get<PaginatedResponse<AdminComment> | AdminComment[]>('/admin/comments/', {
      params: {
        status,
        page,
        page_size: pageSize,
        search: search || undefined,
      },
      signal,
    })

    return toPaginated(res.data)
  },

  getComment: async (id: string, signal?: AbortSignal): Promise<AdminComment> => {
    const res = await apiClient.get<AdminComment>(`/admin/comments/${id}/`, { signal })
    return res.data
  },

  removeComment: async (id: string, signal?: AbortSignal): Promise<AdminComment> => {
    const res = await apiClient.post<AdminComment>(`/admin/comments/${id}/remove/`, {}, { signal })
    return res.data
  },

  restoreComment: async (id: string, signal?: AbortSignal): Promise<AdminComment> => {
    const res = await apiClient.post<AdminComment>(`/admin/comments/${id}/restore/`, {}, { signal })
    return res.data
  },

  getAuditLogs: async (
    actionType?: string,
    targetEntity: AuditTargetFilter = 'all',
    page = 1,
    pageSize = 20,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<AdminAuditLog>> => {
    const res = await apiClient.get<PaginatedResponse<AdminAuditLog> | AdminAuditLog[]>('/admin/audit-logs/', {
      params: {
        action_type: actionType || undefined,
        target_entity: targetEntity === 'all' ? undefined : targetEntity,
        page,
        page_size: pageSize,
      },
      signal,
    })

    return toPaginated(res.data)
  },
}
