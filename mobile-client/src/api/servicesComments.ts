/**
 * Service comments API – list, create, update, delete comments on a service
 * GET/POST /api/services/{service_id}/comments/, PATCH/DELETE .../comments/{id}/, reviewable
 */

import { normalizeRuntimeUrl } from "../constants/env";
import { apiRequest } from './client';

export interface ServiceCommentMedia {
  id: string;
  file_url: string;
}

export interface ServiceCommentReply {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar_url?: string | null;
  body: string;
  is_deleted: boolean;
  is_verified_review: boolean;
  handshake_hours?: number | null;
  handshake_completed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ServiceComment {
  id: string;
  service: string;
  service_title?: string | null;
  user_id: string;
  user_name: string;
  user_avatar_url?: string | null;
  user_karma_score?: number;
  user_badges?: string[];
  user_featured_achievement_id?: string | null;
  parent?: string | null;
  body: string;
  is_deleted: boolean;
  is_verified_review: boolean;
  handshake_id?: string | null;
  handshake_hours?: number | null;
  handshake_completed_at?: string | null;
  reviewed_user_role?: string | null;
  reply_count?: number;
  replies?: ServiceCommentReply[];
  media?: ServiceCommentMedia[];
  created_at: string;
  updated_at?: string;
}

export interface CreateCommentRequest {
  body: string;
  parent_id?: string | null;
  handshake_id?: string | null;
}

export interface CommentsListParams {
  page?: number;
  page_size?: number;
}

function normalizeReply(reply: ServiceCommentReply): ServiceCommentReply {
  return {
    ...reply,
    user_avatar_url: normalizeRuntimeUrl(reply.user_avatar_url),
  };
}

function normalizeComment(comment: ServiceComment): ServiceComment {
  return {
    ...comment,
    user_avatar_url: normalizeRuntimeUrl(comment.user_avatar_url),
    media: (comment.media ?? []).map((item) => ({
      ...item,
      file_url: normalizeRuntimeUrl(item.file_url) ?? item.file_url,
    })),
    replies: (comment.replies ?? []).map(normalizeReply),
  };
}

export function listServiceComments(serviceId: string, params?: CommentsListParams): Promise<{ results: ServiceComment[]; count: number; next: string | null; previous: string | null }> {
  return apiRequest<{ results: ServiceComment[]; count: number; next: string | null; previous: string | null }>(`/services/${serviceId}/comments/`, {
    params: params as Record<string, string | number | undefined>,
  }).then((response) => ({
    ...response,
    results: (response.results ?? []).map(normalizeComment),
  }));
}

export function createServiceComment(serviceId: string, body: CreateCommentRequest): Promise<ServiceComment> {
  return apiRequest<ServiceComment>(`/services/${serviceId}/comments/`, { method: 'POST', body }).then(
    normalizeComment,
  );
}

export function patchServiceComment(serviceId: string, commentId: string, body: Partial<CreateCommentRequest>): Promise<ServiceComment> {
  return apiRequest<ServiceComment>(`/services/${serviceId}/comments/${commentId}/`, {
    method: 'PATCH',
    body,
  }).then(normalizeComment);
}

export function deleteServiceComment(serviceId: string, commentId: string): Promise<void> {
  return apiRequest<void>(`/services/${serviceId}/comments/${commentId}/`, { method: 'DELETE' });
}

export function listReviewableComments(serviceId: string): Promise<ServiceComment[]> {
  return apiRequest<ServiceComment[]>(`/services/${serviceId}/comments/reviewable/`).then(
    (items) => items.map(normalizeComment),
  );
}
