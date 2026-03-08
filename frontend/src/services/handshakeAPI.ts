import apiClient from './api'

export interface Handshake {
  id: string
  service: string | { id: string }
  service_id?: string
  service_title: string
  service_type?: 'Offer' | 'Need' | 'Event'
  schedule_type?: 'One-Time' | 'Recurrent'
  max_participants?: number
  requester: string
  requester_name: string
  provider_name: string
  counterpart?: {
    id: string
    first_name: string
    last_name: string
    email: string
    avatar_url?: string | null
  } | null
  is_current_user_provider?: boolean
  status: 'pending' | 'accepted' | 'denied' | 'cancelled' | 'completed' | 'reported' | 'paused' | 'checked_in' | 'attended' | 'no_show'
  provisioned_hours: number
  provider_confirmed_complete: boolean
  receiver_confirmed_complete: boolean
  /** Set after provider fills in session details via /initiate/ */
  provider_initiated?: boolean
  /** Set after requester approves details via /approve/ */
  requester_initiated?: boolean
  evaluation_window_starts_at?: string | null
  evaluation_window_ends_at?: string | null
  evaluation_window_closed_at?: string | null
  /** True if the current user has already submitted a review for this handshake */
  user_has_reviewed?: boolean
  exact_location?: string | null
  /** Google Maps URL for the exact location (set when session details are initiated). */
  exact_location_maps_url?: string | null
  exact_location_guide?: string | null
  exact_duration?: number | null
  scheduled_time?: string | null
  cancellation_requested_by_id?: string | null
  cancellation_requested_by_name?: string | null
  cancellation_requested_at?: string | null
  cancellation_reason?: string | null
  can_request_cancellation?: boolean
  can_respond_to_cancellation?: boolean
  created_at: string
  updated_at: string
}

export interface InitiatePayload {
  exact_location: string
  exact_duration: number
  scheduled_time: string
  /** Optional coordinates; when provided, backend builds Google Maps URL from them. */
  exact_location_lat?: number
  exact_location_lng?: number
}

export type HandshakeIssueType = 'no_show' | 'service_issue' | 'harassment' | 'spam' | 'scam' | 'other'

export const handshakeAPI = {
  list: async (signal?: AbortSignal): Promise<Handshake[]> => {
    const res = await apiClient.get<Handshake[]>('/handshakes/', { signal })
    return Array.isArray(res.data) ? res.data : []
  },

  get: async (id: string, signal?: AbortSignal): Promise<Handshake> => {
    const res = await apiClient.get<Handshake>(`/handshakes/${id}/`, { signal })
    return res.data
  },

  accept: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/accept/`, {})
    return res.data
  },

  deny: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/deny/`, {})
    return res.data
  },

  cancel: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/cancel/`, {})
    return res.data
  },

  requestCancellation: async (id: string, reason?: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/cancel-request/`, {
      ...(reason ? { reason } : {}),
    })
    return res.data
  },

  approveCancellation: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/cancel-request/approve/`, {})
    return res.data
  },

  rejectCancellation: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/cancel-request/reject/`, {})
    return res.data
  },

  /**
   * Provider fills in session details (location, duration, scheduled_time).
   * Sets provider_initiated=true; status stays pending until requester approves.
   */
  initiate: async (id: string, payload: InitiatePayload): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/initiate/`, payload)
    return res.data
  },

  /**
   * Requester reviews provider's details and approves.
   * Transitions status pending → accepted and provisions TimeBank.
   */
  approve: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/approve/`, {})
    return res.data
  },

  /**
   * Requester declines the proposed session details. Resets provider_initiated so
   * the provider can propose new details (location, duration, time) via initiate.
   */
  requestChanges: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/request-changes/`, {})
    return res.data
  },

  /**
   * Either party confirms service completion.
   * When both confirm, status transitions to completed.
   */
  confirm: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/confirm/`, {})
    return res.data
  },

  report: async (
    id: string,
    issueType: HandshakeIssueType,
    description: string,
    reportedUserId?: string,
  ): Promise<{ status: string; report_id: string }> => {
    const res = await apiClient.post<{ status: string; report_id: string }>(
      `/handshakes/${id}/report/`,
      {
        issue_type: issueType,
        description,
        ...(reportedUserId ? { reported_user_id: reportedUserId } : {}),
      },
    )
    return res.data
  },

  // ─── Event actions ────────────────────────────────────────────────────────

  /**
   * Join an event — creates a Handshake directly in 'accepted' state (no approval flow).
   */
  joinEvent: async (serviceId: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/services/${serviceId}/join-event/`, {})
    return res.data
  },

  /**
   * Participant self-cancels before lockdown window.
   */
  leaveEvent: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/leave-event/`, {})
    return res.data
  },

  /**
   * Participant checks in during the 24-hour lockdown window.
   */
  checkin: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/checkin/`, {})
    return res.data
  },

  /**
   * Organizer manually confirms a checked-in participant as attended.
   */
  markAttended: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/mark-attended/`, {})
    return res.data
  },
}
