/**
 * Users API – profile (me, by id), update, badge-progress, history, verified-reviews
 * GET/PUT/PATCH /api/users/me/, GET/PUT/PATCH /api/users/{id}/,
 * GET /api/users/{id}/badge-progress/, history/, verified-reviews/
 */

import { apiRequest } from "./client";
import type {
  PaginatedResponse,
  PublicUserProfile,
  UserHistoryItem,
  UserSummary,
} from "./types";

export interface ProfileReview {
  id: string;
  service: string;
  service_title?: string;
  user_id: string;
  user_name: string;
  user_avatar_url?: string;
  body: string;
  is_verified_review: boolean;
  handshake_hours?: number;
  handshake_completed_at?: string;
  reviewed_user_role?: "provider" | "receiver" | "organizer" | null;
  reply_count: number;
  replies: unknown[];
  created_at: string;
  updated_at: string;
}

export interface ProfileReviewsResponse {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: ProfileReview[];
}

export interface UserProfileRequest {
  first_name?: string;
  last_name?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
}

export function getMe(): Promise<UserSummary> {
  return apiRequest<UserSummary>("/users/me/");
}

export function updateMe(
  body: Partial<UserProfileRequest>,
): Promise<UserSummary> {
  return apiRequest<UserSummary>("/users/me/", { method: "PUT", body });
}

export function patchMe(
  body: Partial<UserProfileRequest>,
): Promise<UserSummary> {
  return apiRequest<UserSummary>("/users/me/", { method: "PATCH", body });
}

export function getUser(id: string): Promise<PublicUserProfile> {
  return apiRequest<PublicUserProfile>(`/users/${id}/`);
}

export function followUser(userId: string): Promise<void> {
  return apiRequest<void>(`/users/${userId}/follow/`, {
    method: "POST",
    body: {},
  });
}

export function unfollowUser(userId: string): Promise<void> {
  return apiRequest<void>(`/users/${userId}/follow/`, { method: "DELETE" });
}

function normalizeUserSummaryList(
  data: UserSummary[] | PaginatedResponse<UserSummary>,
): UserSummary[] {
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export function getFollowers(userId: string): Promise<UserSummary[]> {
  return apiRequest<UserSummary[] | PaginatedResponse<UserSummary>>(
    `/users/${userId}/followers/`,
  ).then(normalizeUserSummaryList);
}

export function getFollowing(userId: string): Promise<UserSummary[]> {
  return apiRequest<UserSummary[] | PaginatedResponse<UserSummary>>(
    `/users/${userId}/following/`,
  ).then(normalizeUserSummaryList);
}

export function updateUser(
  id: string,
  body: Partial<UserProfileRequest>,
): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/users/${id}/`, { method: "PUT", body });
}

export function patchUser(
  id: string,
  body: Partial<UserProfileRequest>,
): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/users/${id}/`, { method: "PATCH", body });
}

export function getBadgeProgress(userId: string): Promise<unknown> {
  return apiRequest(`/users/${userId}/badge-progress/`);
}

function normalizeUserHistoryList(
  data: UserHistoryItem[] | { results?: UserHistoryItem[] },
): UserHistoryItem[] {
  if (Array.isArray(data)) return data;
  return data?.results ?? [];
}

export function getUserHistory(
  userId: string,
  params?: { page?: number; page_size?: number },
): Promise<UserHistoryItem[]> {
  return apiRequest<UserHistoryItem[] | { results: UserHistoryItem[] }>(
    `/users/${userId}/history/`,
    {
      params: params as Record<string, string | number | undefined>,
    },
  ).then(normalizeUserHistoryList);
}

export function getVerifiedReviews(
  userId: string,
  params?: {
    page?: number;
    page_size?: number;
    role?: "provider" | "receiver" | "organizer";
  },
): Promise<ProfileReviewsResponse> {
  return apiRequest<ProfileReviewsResponse>(`/users/${userId}/verified-reviews/`, {
    params: params as Record<string, string | number | undefined>,
  });
}
