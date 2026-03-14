/**
 * Service comments API – list, create, update, delete comments on a service
 * GET/POST /api/services/{service_id}/comments/, PATCH/DELETE .../comments/{id}/, reviewable
 */

import { apiRequest } from './client';

export interface ServiceComment {
  id: string;
  service: string;
  user: { id: string; first_name: string; last_name: string; avatar_url?: string | null };
  content: string;
  created_at: string;
  updated_at?: string;
  is_review?: boolean;
}

export interface CreateCommentRequest {
  content: string;
  is_review?: boolean;
}

export interface CommentsListParams {
  page?: number;
  page_size?: number;
}

export function listServiceComments(serviceId: string, params?: CommentsListParams): Promise<{ results: ServiceComment[]; count: number; next: string | null; previous: string | null }> {
  return apiRequest(`/services/${serviceId}/comments/`, { params: params as Record<string, string | number | undefined> });
}

export function createServiceComment(serviceId: string, body: CreateCommentRequest): Promise<ServiceComment> {
  return apiRequest<ServiceComment>(`/services/${serviceId}/comments/`, { method: 'POST', body });
}

export function patchServiceComment(serviceId: string, commentId: string, body: Partial<CreateCommentRequest>): Promise<ServiceComment> {
  return apiRequest<ServiceComment>(`/services/${serviceId}/comments/${commentId}/`, { method: 'PATCH', body });
}

export function deleteServiceComment(serviceId: string, commentId: string): Promise<void> {
  return apiRequest<void>(`/services/${serviceId}/comments/${commentId}/`, { method: 'DELETE' });
}

export function listReviewableComments(serviceId: string): Promise<ServiceComment[]> {
  return apiRequest<ServiceComment[]>(`/services/${serviceId}/comments/reviewable/`);
}
