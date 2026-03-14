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
