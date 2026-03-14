/**
 * Notifications API – list, retrieve, mark as read
 * GET /api/notifications/, GET /api/notifications/{id}/, POST /api/notifications/read/
 */

import { apiRequest } from './client';
import type { PaginatedResponse } from './types';

export interface Notification {
  id: string;
  user?: string;
  message?: string;
  read?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

export interface NotificationsListParams {
  page?: number;
  page_size?: number;
  unread_only?: boolean;
}

export function listNotifications(params?: NotificationsListParams): Promise<PaginatedResponse<Notification>> {
  return apiRequest<PaginatedResponse<Notification>>('/notifications/', { params: params as Record<string, string | number | boolean | undefined> });
}

export function getNotification(id: string): Promise<Notification> {
  return apiRequest<Notification>(`/notifications/${id}/`);
}

export function markNotificationsRead(body?: { ids?: string[] }): Promise<unknown> {
  return apiRequest('/notifications/read/', { method: 'POST', body: body ?? {} });
}
