/**
 * Forum API – categories, topics, posts (list, create, get, update, delete; lock, pin)
 * GET/POST /api/forum/categories/, GET/PATCH/DELETE /api/forum/categories/{slug}/
 * GET/POST /api/forum/topics/, GET/PATCH/DELETE /api/forum/topics/{id}/, lock, pin
 * GET /api/forum/topics/{topic_id}/posts/, POST /api/forum/topics/{topic_id}/posts/
 * PATCH/DELETE /api/forum/posts/{id}/, GET /api/forum/posts/recent/
 */

import { apiRequest } from './client';
import { normalizeRuntimeUrl } from '../constants/env';
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
  body: string;
}

export interface ReportRequest {
  type: 'inappropriate_content' | 'spam' | 'harassment' | 'scam' | 'other';
  description?: string;
}

export interface ReportResponse {
  id: string;
  type: string;
  status: string;
  description: string;
  created_at: string;
}

export interface ForumActivity {
  my_topics: number;
  my_replies: number;
  open_topics: number;
  open_topic_items: ForumTopic[];
}

/** Rewrite the author's avatar from a relative `/media/...` path into an
 * absolute URL the mobile client can actually load. */
function normalizeTopic(topic: ForumTopic): ForumTopic {
  return {
    ...topic,
    author_avatar_url: normalizeRuntimeUrl(topic.author_avatar_url) ?? null,
  };
}

function normalizePost(post: ForumPost): ForumPost {
  return {
    ...post,
    author_avatar_url: normalizeRuntimeUrl(post.author_avatar_url) ?? null,
  };
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

export type TopicSortOption = 'newest' | 'most_active';

export async function listTopics(params?: {
  page?: number;
  page_size?: number;
  category?: string;
  sort?: TopicSortOption;
}): Promise<PaginatedResponse<ForumTopic>> {
  const res = await apiRequest<PaginatedResponse<ForumTopic>>(
    '/forum/topics/',
    { params: params as Record<string, string | number | undefined> },
  );
  return { ...res, results: (res.results ?? []).map(normalizeTopic) };
}

export async function getMyActivity(): Promise<ForumActivity> {
  const res = await apiRequest<ForumActivity>('/forum/my-activity/');
  return {
    ...res,
    open_topic_items: (res.open_topic_items ?? []).map(normalizeTopic),
  };
}

export async function createTopic(body: TopicRequest): Promise<ForumTopic> {
  const res = await apiRequest<ForumTopic>('/forum/topics/', { method: 'POST', body });
  return normalizeTopic(res);
}

export async function getTopic(id: string): Promise<ForumTopic> {
  const res = await apiRequest<ForumTopic>(`/forum/topics/${id}/`);
  return normalizeTopic(res);
}

export async function patchTopic(id: string, body: Partial<TopicRequest>): Promise<ForumTopic> {
  const res = await apiRequest<ForumTopic>(`/forum/topics/${id}/`, { method: 'PATCH', body });
  return normalizeTopic(res);
}

export function deleteTopic(id: string): Promise<void> {
  return apiRequest<void>(`/forum/topics/${id}/`, { method: 'DELETE' });
}

export async function lockTopic(id: string, body?: object): Promise<ForumTopic> {
  const res = await apiRequest<ForumTopic>(`/forum/topics/${id}/lock/`, { method: 'POST', body: body ?? {} });
  return normalizeTopic(res);
}

export async function pinTopic(id: string, body?: object): Promise<ForumTopic> {
  const res = await apiRequest<ForumTopic>(`/forum/topics/${id}/pin/`, { method: 'POST', body: body ?? {} });
  return normalizeTopic(res);
}

export async function listTopicPosts(
  topicId: string,
  params?: { page?: number; page_size?: number },
): Promise<PaginatedResponse<ForumPost>> {
  const res = await apiRequest<PaginatedResponse<ForumPost>>(
    `/forum/topics/${topicId}/posts/`,
    { params: params as Record<string, string | number | undefined> },
  );
  return { ...res, results: (res.results ?? []).map(normalizePost) };
}

export async function createTopicPost(topicId: string, body: PostRequest): Promise<ForumPost> {
  const res = await apiRequest<ForumPost>(`/forum/topics/${topicId}/posts/`, { method: 'POST', body });
  return normalizePost(res);
}

export async function patchPost(id: string, body: Partial<PostRequest>): Promise<ForumPost> {
  const res = await apiRequest<ForumPost>(`/forum/posts/${id}/`, { method: 'PATCH', body });
  return normalizePost(res);
}

export function deletePost(id: string): Promise<void> {
  return apiRequest<void>(`/forum/posts/${id}/`, { method: 'DELETE' });
}

export async function listRecentPosts(params?: { limit?: number }): Promise<ForumPost[]> {
  const res = await apiRequest<ForumPost[]>('/forum/posts/recent/', { params: params as Record<string, number | undefined> });
  return res.map(normalizePost);
}

export function reportTopic(id: string, body: ReportRequest): Promise<ReportResponse> {
  return apiRequest<ReportResponse>(`/forum/topics/${id}/report/`, { method: 'POST', body });
}

export function reportPost(id: string, body: ReportRequest): Promise<ReportResponse> {
  return apiRequest<ReportResponse>(`/forum/posts/${id}/report/`, { method: 'POST', body });
}
