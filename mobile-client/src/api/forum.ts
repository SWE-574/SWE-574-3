/**
 * Forum API – categories, topics, posts (list, create, get, update, delete; lock, pin)
 * GET/POST /api/forum/categories/, GET/PATCH/DELETE /api/forum/categories/{slug}/
 * GET/POST /api/forum/topics/, GET/PATCH/DELETE /api/forum/topics/{id}/, lock, pin
 * GET /api/forum/topics/{topic_id}/posts/, POST /api/forum/topics/{topic_id}/posts/
 * PATCH/DELETE /api/forum/posts/{id}/, GET /api/forum/posts/recent/
 */

import { apiRequest } from './client';
import type { PaginatedResponse } from './types';

export interface ForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
  is_active: boolean;
  topic_count: number;
  post_count: number;
  last_activity: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForumTopic {
  id: string;
  category: string;
  category_name: string;
  category_slug: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  title: string;
  body: string;
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  last_activity: string;
  created_at: string;
  updated_at: string;
}

export interface ForumPost {
  id: string;
  topic: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  body: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryRequest {
  name: string;
  description?: string;
  slug?: string;
}

export interface TopicRequest {
  title: string;
  category: string;
  body: string;
}

export interface PostRequest {
  content: string;
}

export function listCategories(): Promise<ForumCategory[]> {
  return apiRequest<ForumCategory[]>('/forum/categories/');
}

export function createCategory(body: CategoryRequest): Promise<ForumCategory> {
  return apiRequest<ForumCategory>('/forum/categories/', { method: 'POST', body });
}

export function getCategory(slug: string): Promise<ForumCategory> {
  return apiRequest<ForumCategory>(`/forum/categories/${encodeURIComponent(slug)}/`);
}

export function patchCategory(slug: string, body: Partial<CategoryRequest>): Promise<ForumCategory> {
  return apiRequest<ForumCategory>(`/forum/categories/${encodeURIComponent(slug)}/`, { method: 'PATCH', body });
}

export function deleteCategory(slug: string): Promise<void> {
  return apiRequest<void>(`/forum/categories/${encodeURIComponent(slug)}/`, { method: 'DELETE' });
}

export function listTopics(params?: { page?: number; page_size?: number; category?: string }): Promise<PaginatedResponse<ForumTopic>> {
  return apiRequest<PaginatedResponse<ForumTopic>>('/forum/topics/', { params: params as Record<string, string | number | undefined> });
}

export function createTopic(body: TopicRequest): Promise<ForumTopic> {
  return apiRequest<ForumTopic>('/forum/topics/', { method: 'POST', body });
}

export function getTopic(id: string): Promise<ForumTopic> {
  return apiRequest<ForumTopic>(`/forum/topics/${id}/`);
}

export function patchTopic(id: string, body: Partial<TopicRequest>): Promise<ForumTopic> {
  return apiRequest<ForumTopic>(`/forum/topics/${id}/`, { method: 'PATCH', body });
}

export function deleteTopic(id: string): Promise<void> {
  return apiRequest<void>(`/forum/topics/${id}/`, { method: 'DELETE' });
}

export function lockTopic(id: string, body?: object): Promise<ForumTopic> {
  return apiRequest<ForumTopic>(`/forum/topics/${id}/lock/`, { method: 'POST', body: body ?? {} });
}

export function pinTopic(id: string, body?: object): Promise<ForumTopic> {
  return apiRequest<ForumTopic>(`/forum/topics/${id}/pin/`, { method: 'POST', body: body ?? {} });
}

export function listTopicPosts(topicId: string, params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<ForumPost>> {
  return apiRequest<PaginatedResponse<ForumPost>>(`/forum/topics/${topicId}/posts/`, { params: params as Record<string, string | number | undefined> });
}

export function createTopicPost(topicId: string, body: PostRequest): Promise<ForumPost> {
  return apiRequest<ForumPost>(`/forum/topics/${topicId}/posts/`, { method: 'POST', body });
}

export function patchPost(id: string, body: Partial<PostRequest>): Promise<ForumPost> {
  return apiRequest<ForumPost>(`/forum/posts/${id}/`, { method: 'PATCH', body });
}

export function deletePost(id: string): Promise<void> {
  return apiRequest<void>(`/forum/posts/${id}/`, { method: 'DELETE' });
}

export function listRecentPosts(params?: { limit?: number }): Promise<ForumPost[]> {
  return apiRequest<ForumPost[]>('/forum/posts/recent/', { params: params as Record<string, number | undefined> });
}
