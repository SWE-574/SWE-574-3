/**
 * Shared types for The Hive API responses and requests.
 * Align with API docs: https://apiary.selmangunes.com/api/docs/
 */

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface UserSummary {
  id: string;
  email?: string;
  first_name: string;
  last_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  timebank_balance?: string;
  karma_score?: number;
  role?: string;
  date_joined?: string;
  badges?: string[];
  featured_badge?: string | null;
  featured_achievement_id?: string | null;
  /** When false, other users should not see exchange history (web parity). */
  show_history?: boolean;
  followers_count?: number;
  following_count?: number;
}

/**
 * Fields from GET /users/{id}/ for another user (`PublicUserProfileSerializer`)
 * that the mobile public profile screen consumes. The API may return more keys.
 */
export interface PublicUserProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  location?: string | null;
  karma_score?: number;
  date_joined?: string;
  helpful_count?: number;
  kind_count?: number;
  punctual_count?: number;
  badges?: string[];
  achievements?: string[];
  skills?: Array<{ id: string; name: string }>;
  portfolio_images?: string[];
  /** Public exchange history visibility; when false, do not fetch history for viewers. */
  show_history?: boolean;
  /** Present for authenticated viewers; whether the current user follows this profile. */
  is_following?: boolean;
  followers_count?: number;
  following_count?: number;
}

/** GET /users/{id}/history/ row shape (web `UserHistoryItem`). */
export interface UserHistoryItem {
  service_id: string;
  service_title: string;
  service_type: "Offer" | "Need" | "Event";
  schedule_type: "One-Time" | "Recurrent";
  max_participants: number;
  duration: number | string;
  partner_name: string;
  partner_id: string;
  partner_avatar_url?: string | null;
  completed_date: string;
  was_provider: boolean;
}

export interface Tag {
  id: string;
  name: string;
  wikidata_info?: unknown | null;
}

export type ServiceType = "Offer" | "Need" | "Event";
export type ServiceStatus = "Active" | "Completed" | "Cancelled" | string;
export type LocationType = "In-Person" | "Online" | "remote" | string;
export type ScheduleType = "One-Time" | "Recurrent" | string;

export interface Service {
  id: string;
  user: UserSummary;
  title: string;
  description: string;
  type: ServiceType;
  duration: string;
  location_type: LocationType;
  location_area: string | null;
  location_lat?: string | null;
  location_lng?: string | null;
  status: ServiceStatus;
  max_participants: number;
  schedule_type?: ScheduleType;
  schedule_details?: string | null;
  participant_count?: number;
  created_at: string;
  tags: Tag[];
  comment_count?: number;
  hot_score?: number;
  is_visible?: boolean;
  media?: unknown[];
}

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface TokenRefreshRequest {
  refresh: string;
}
