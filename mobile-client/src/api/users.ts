/**
 * Users API – profile (me, by id), update, badge-progress, history, verified-reviews
 * GET/PUT/PATCH /api/users/me/, GET/PUT/PATCH /api/users/{id}/,
 * GET /api/users/{id}/badge-progress/, history/, verified-reviews/
 */

import { apiRequest } from "./client";
import type { UserSummary } from "./types";

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

export function getUser(id: string): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/users/${id}/`);
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

export function getUserHistory(
  userId: string,
  params?: { page?: number; page_size?: number },
): Promise<unknown> {
  return apiRequest(`/users/${userId}/history/`, {
    params: params as Record<string, string | number | undefined>,
  });
}

export function getVerifiedReviews(
  userId: string,
  params?: { page?: number; page_size?: number },
): Promise<unknown> {
  return apiRequest(`/users/${userId}/verified-reviews/`, {
    params: params as Record<string, string | number | undefined>,
  });
}
