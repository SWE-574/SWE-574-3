/**
 * Users API – profile (me, by id), update, badge-progress, history, verified-reviews
 * GET/PUT/PATCH /api/users/me/, GET/PUT/PATCH /api/users/{id}/,
 * GET /api/users/{id}/badge-progress/, history/, verified-reviews/
 */

import { apiRequest } from "./client";
import { normalizeRuntimeUrl } from "../constants/env";
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
  location?: string;
  avatar_url?: string;
  banner_url?: string;
  /** Up to 2 badge IDs to feature in the profile hero (must be earned). */
  featured_badges?: string[];
}

function normalizeUserSummary(user: UserSummary): UserSummary {
  return {
    ...user,
    avatar_url: normalizeRuntimeUrl(user.avatar_url),
    banner_url: normalizeRuntimeUrl(user.banner_url),
  };
}

function normalizePublicUserProfile(user: PublicUserProfile): PublicUserProfile {
  return {
    ...user,
    avatar_url: normalizeRuntimeUrl(user.avatar_url),
    banner_url: normalizeRuntimeUrl(user.banner_url),
  };
}

function normalizeProfileReview(review: ProfileReview): ProfileReview {
  return {
    ...review,
    user_avatar_url: normalizeRuntimeUrl(review.user_avatar_url) ?? undefined,
  };
}

function normalizeUserHistoryItem(item: UserHistoryItem): UserHistoryItem {
  return {
    ...item,
    partner_avatar_url: normalizeRuntimeUrl(item.partner_avatar_url),
  };
}

export function getMe(): Promise<UserSummary> {
  return apiRequest<UserSummary>("/users/me/").then(normalizeUserSummary);
}

export function updateMe(
  body: Partial<UserProfileRequest>,
): Promise<UserSummary> {
  return apiRequest<UserSummary>("/users/me/", { method: "PUT", body }).then(
    normalizeUserSummary,
  );
}

export function patchMe(
  body: Partial<UserProfileRequest> | FormData,
): Promise<UserSummary> {
  return apiRequest<UserSummary>("/users/me/", { method: "PATCH", body }).then(
    normalizeUserSummary,
  );
}

export function getUser(id: string): Promise<PublicUserProfile> {
  return apiRequest<PublicUserProfile>(`/users/${id}/`).then(
    normalizePublicUserProfile,
  );
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
  const rows = Array.isArray(data) ? data : data.results ?? [];
  return rows.map(normalizeUserSummary);
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
  return apiRequest<UserSummary>(`/users/${id}/`, { method: "PUT", body }).then(
    normalizeUserSummary,
  );
}

export function patchUser(
  id: string,
  body: Partial<UserProfileRequest>,
): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/users/${id}/`, { method: "PATCH", body }).then(
    normalizeUserSummary,
  );
}

export function getBadgeProgress(userId: string): Promise<unknown> {
  return apiRequest(`/users/${userId}/badge-progress/`);
}

function normalizeUserHistoryList(
  data: UserHistoryItem[] | { results?: UserHistoryItem[] },
): UserHistoryItem[] {
  const rows = Array.isArray(data) ? data : data?.results ?? [];
  return rows.map(normalizeUserHistoryItem);
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
  }).then((response) => ({
    ...response,
    results: (response.results ?? []).map(normalizeProfileReview),
  }));
}
