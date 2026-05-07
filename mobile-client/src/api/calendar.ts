/**
 * Calendar API – fetch the authenticated user's upcoming schedule.
 * GET /api/users/me/calendar/?from=YYYY-MM-DD&to=YYYY-MM-DD
 */

import { apiRequest } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

export type CalendarItemKind =
  | "service_session"
  | "event_organized"
  | "event_joined"
  | "scheduled_commitment";

export type CalendarAccentToken = "GREEN" | "BLUE" | "TEAL";

export type CalendarLinkType = "service" | "event" | "chat";

export type CalendarItemStatus =
  | "accepted"
  | "checked_in"
  | "attended"
  | "completed"
  | "Active"
  | "Agreed"
  | "Completed";

export interface CalendarCounterpart {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface CalendarLink {
  type: CalendarLinkType;
  id: string;
}

export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  title: string;
  start: string;
  end: string;
  duration_hours: number;
  location_type: "In-Person" | "Online" | string;
  location_label: string | null;
  service_type: "Offer" | "Need" | "Event" | null;
  service_id: string | null;
  handshake_id: string | null;
  chat_id: string | null;
  counterpart: CalendarCounterpart | null;
  is_owner: boolean;
  status: CalendarItemStatus;
  accent_token: CalendarAccentToken;
  link: CalendarLink;
}

export interface CalendarConflict {
  item_id: string;
  overlaps_with: string[];
}

export interface CalendarRange {
  from: string;
  to: string;
}

export interface CalendarResponse {
  items: CalendarItem[];
  conflicts: CalendarConflict[];
  range: CalendarRange;
}

export interface BadgeDetail {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  earned_at: string;
}

// ── Params ────────────────────────────────────────────────────────────────

export interface FetchCalendarParams {
  from: string;
  to: string;
}

// ── API function ──────────────────────────────────────────────────────────

/**
 * Fetch the authenticated user's calendar items in the given date window.
 *
 * @param params  `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`
 * @param signal  optional AbortSignal for cancellation
 */
export async function fetchUpcoming(
  params: FetchCalendarParams,
  signal?: AbortSignal,
): Promise<CalendarResponse> {
  return apiRequest<CalendarResponse>("/users/me/calendar/", {
    params: { from: params.from, to: params.to },
    signal,
  });
}
