/**
 * Tags API – list, create, retrieve, update, delete tags
 * GET/POST /api/tags/, GET/PUT/PATCH/DELETE /api/tags/{id}/
 */

import { apiRequest } from './client';
import type { Tag, PaginatedResponse } from './types';

export interface TagRequest {
  name: string;
}

export interface TagsListParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export function listTags(params?: TagsListParams): Promise<Tag[] | PaginatedResponse<Tag>> {
  return apiRequest<Tag[] | PaginatedResponse<Tag>>('/tags/', { params: params as Record<string, string | number | undefined> });
}

export function getTag(id: string): Promise<Tag> {
  return apiRequest<Tag>(`/tags/${id}/`);
}

export function createTag(body: TagRequest): Promise<Tag> {
  return apiRequest<Tag>('/tags/', { method: 'POST', body });
}

export function updateTag(id: string, body: Partial<TagRequest>): Promise<Tag> {
  return apiRequest<Tag>(`/tags/${id}/`, { method: 'PUT', body });
}

export function patchTag(id: string, body: Partial<TagRequest>): Promise<Tag> {
  return apiRequest<Tag>(`/tags/${id}/`, { method: 'PATCH', body });
}

export function deleteTag(id: string): Promise<void> {
  return apiRequest<void>(`/tags/${id}/`, { method: 'DELETE' });
}
