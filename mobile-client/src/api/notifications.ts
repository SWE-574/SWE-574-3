/**
 * Notifications API – list, retrieve, mark as read, unread count, push token registration.
 * GET /api/notifications/, GET /api/notifications/{id}/,
 * GET /api/notifications/unread-count/, PATCH /api/notifications/{id}/read/,
 * POST /api/notifications/read/,
 * POST /api/notifications/register-push-token/, POST /api/notifications/deregister-push-token/
 */

import { apiRequest } from './client';
import type { PaginatedResponse } from './types';

export type NotificationType =
  | 'handshake_request'
  | 'handshake_accepted'
  | 'handshake_denied'
  | 'handshake_cancellation_requested'
  | 'handshake_cancellation_rejected'
  | 'handshake_cancelled'
  | 'service_updated'
  | 'chat_message'
  | 'service_reminder'
  | 'service_confirmation'
  | 'positive_rep'
  | 'admin_warning'
  | 'dispute_resolved';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  related_handshake: string | null;
  related_service: string | null;
  created_at: string;
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

export function getUnreadCount(): Promise<{ count: number }> {
  return apiRequest<{ count: number }>('/notifications/unread-count/');
}

export function markNotificationRead(id: string): Promise<void> {
  return apiRequest('/notifications/' + id + '/read/', { method: 'PATCH' });
}

export function markAllNotificationsRead(): Promise<void> {
  return apiRequest('/notifications/read/', { method: 'POST', body: {} });
}

export function registerPushToken(token: string): Promise<void> {
  return apiRequest('/notifications/register-push-token/', { method: 'POST', body: { token } });
}

export function deregisterPushToken(token: string): Promise<void> {
  return apiRequest('/notifications/deregister-push-token/', { method: 'POST', body: { token } });
}
