// ─── Error Types ─────────────────────────────────────────────────────────────

export interface ApiError {
  message: string
  errors?: Record<string, string[]>
  detail?: string
}

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_STATE: 'INVALID_STATE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_INPUT: 'INVALID_INPUT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVER_ERROR: 'SERVER_ERROR',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

// ─── Auth Types ───────────────────────────────────────────────────────────────

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  first_name: string
  last_name: string
  location?: string
}

export interface AuthResponse {
  access: string
  refresh: string
  user?: User
}

export interface MeResponse {
  user: User
}

// ─── User Types ───────────────────────────────────────────────────────────────

export const UserRole = {
  ANONYMOUS: 'anonymous',
  REGISTERED: 'registered',
  ADMIN: 'admin',
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  bio?: string
  avatar_url?: string
  banner_url?: string
  date_joined?: string
  timebank_balance?: number
  karma_score?: number
  featured_badge?: string | null
  featured_achievement_id?: string | null
  achievements?: string[]
  badges?: string[]
  show_history?: boolean
  video_intro_url?: string | null
  video_intro_file_url?: string | null
  is_active?: boolean
  is_banned?: boolean
  is_admin?: boolean
  warning_count?: number
  // ─── Auth state ─────────────────────────────────────────────────────────────
  is_verified?: boolean
  is_onboarded?: boolean
  // ─── Reputation counts (returned by /users/:id/ detail) ────────────────────
  punctual_count?: number
  helpful_count?: number
  kind_count?: number
  // ─── Follow system (profile detail) ───────────────────────────────────────
  followers_count?: number
  following_count?: number
  is_following?: boolean
  location?: string
  skills?: Tag[]
  // ─── Event System ───────────────────────────────────────────────────────────
  is_event_banned_until?: string | null
  is_organizer_banned_until?: string | null
  no_show_count?: number
  created_events?: Service[]
  joined_events?: ProfileEventHandshake[]
  invited_events?: ProfileEventHandshake[]
}

/** Minimal user row from GET /users/:id/followers/ and .../following/ */
export interface UserSummary {
  id: string
  email: string
  first_name: string
  last_name: string
  avatar_url?: string | null
}

export interface ProfileEventHandshake {
  id: string
  service: string
  service_id?: string
  service_title: string
  service_type?: 'Offer' | 'Need' | 'Event'
  status: 'pending' | 'accepted' | 'denied' | 'cancelled' | 'completed' | 'reported' | 'paused' | 'checked_in' | 'attended' | 'no_show'
  requester: string
  requester_name: string
  provider_name: string
  scheduled_time?: string | null
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  user_id: string
  bio?: string
  profile_picture?: string
  avatar?: string
  geo_location?: string
  location?: string
  skills: string[]
  time_credits: number
  rating?: number
  is_onboarded?: boolean
}

// ─── Service / Offer Types ────────────────────────────────────────────────────

export interface ServiceFormData {
  title: string
  description: string
  type: 'Offer' | 'Need' | 'Event'
  duration: number | string
  location_type: 'In-Person' | 'Online'
  location_area?: string
  session_exact_location?: string
  session_exact_location_lat?: number | string | null
  session_exact_location_lng?: number | string | null
  session_location_guide?: string
  max_participants: number
  schedule_type: 'One-Time' | 'Recurrent'
  schedule_details?: string
  tags?: string[]
  tag_names?: string[]
  scheduled_time?: string | null
}

export interface Service {
  id: string
  title: string
  description: string
  type: 'Offer' | 'Need' | 'Event'
  duration: number | string
  status: 'Active' | 'Agreed' | 'Completed' | 'Cancelled'
  location_type: 'In-Person' | 'Online'
  scheduled_time?: string | null
  location_area?: string
  session_exact_location?: string | null
  session_exact_location_lat?: string | number | null
  session_exact_location_lng?: string | number | null
  session_location_guide?: string | null
  // API returns location_lat/location_lng (backend field names)
  location_lat?: string | number | null
  location_lng?: string | number | null
  // Alias fields
  latitude?: number
  longitude?: number
  max_participants: number
  participant_count: number
  schedule_type: 'One-Time' | 'Recurrent'
  schedule_details?: string
  tags: Tag[]
  media?: ServiceMedia[]
  // Backend returns `user`; `provider` kept for compatibility
  user?: User
  provider?: User
  created_at: string
  updated_at: string
  interest_count?: number
  is_visible?: boolean
  is_pinned?: boolean
  comment_count?: number
  hot_score?: number
  event_evaluation_summary?: EventEvaluationSummary | null
}

export interface EventEvaluationSummary {
  total_attended: number
  positive_feedback_count: number
  negative_feedback_count: number
  unique_evaluator_count: number
  positive_score_total: number
  negative_score_total: number
  well_organized_count: number
  engaging_count: number
  welcoming_count: number
  disorganized_count: number
  boring_count: number
  unwelcoming_count: number
  well_organized_average: number
  engaging_average: number
  welcoming_average: number
  disorganized_average: number
  boring_average: number
  unwelcoming_average: number
  organizer_event_hot_score: number
  feedback_submission_count: number
  updated_at: string
}

export interface ServiceMedia {
  id: string
  file_url: string
  media_type: 'image' | 'video'
  order?: number
}

export interface RecommendationDebugNode {
  id: string
  label: string
  tone: 'positive' | 'negative' | 'neutral'
}

export interface RecommendationDebugLink {
  source: string
  target: string
  value: number
  tone: 'positive' | 'negative' | 'neutral'
}

export interface RecommendationDebugBreakdown {
  positive_count: number
  negative_count: number
  comment_count: number
  numerator: number
  age_hours: number
  denominator: number
  raw_hot_score: number
  capacity_ratio: number | null
  capacity_boost_applied: boolean
  social_reason: string
}

export interface RecommendationDebugSelectedService {
  id: string
  title: string
  type: 'Offer' | 'Need' | 'Event'
  owner_name: string
  location_type: 'In-Person' | 'Online'
  location_area?: string
  current_position?: number
  is_pinned: boolean
  stored_hot_score: number
  recomputed_hot_score: number
  search_score: number
  social_boost: number
  weighted_social_boost: number
  distance_km: number | null
  participant_count: number
  max_participants: number
  breakdown: RecommendationDebugBreakdown
  formula_lines: string[]
  notes: string[]
  sankey: {
    nodes: RecommendationDebugNode[]
    links: RecommendationDebugLink[]
  }
}

export interface RecommendationDebugResponse {
  active_filter: string
  total_services: number
  selected_service: RecommendationDebugSelectedService | null
}

export interface RecommendationDebugAvailabilityResponse {
  enabled: boolean
}

export interface Tag {
  id: string
  name: string
  wikidata_id?: string
  parent_qid?: string
  entity_type?: string
  description?: string
}

// ─── Handshake Types ──────────────────────────────────────────────────────────

export type HandshakeStatus =
  | 'pending'
  | 'accepted'
  | 'initiated'
  | 'approved'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'disputed'
  | 'paused'
  | 'checked_in'
  | 'attended'
  | 'no_show'

export interface Handshake {
  id: string
  service: Service
  requester: User
  provider: User
  status: HandshakeStatus
  proposed_time?: string
  actual_duration?: number
  requester_confirmed: boolean
  provider_confirmed: boolean
  created_at: string
  updated_at: string
  dispute_reason?: string
  notes?: string
}

// ─── Chat & Message Types ─────────────────────────────────────────────────────

export interface Conversation {
  handshake_id: string
  other_user: User
  last_message?: ChatMessage
  unread_count?: number
}

export interface ChatMessage {
  id: string
  handshake: string
  sender: User
  body: string
  created_at: string
}

// ─── Notification Types ───────────────────────────────────────────────────────

export type NotificationType =
  | 'handshake_request'
  | 'handshake_accepted'
  | 'handshake_denied'
  | 'handshake_cancellation_requested'
  | 'handshake_cancellation_rejected'
  | 'handshake_cancelled'
  | 'service_updated'
  | 'chat_message'
  | 'service_reminder'
  | 'service_confirmation'
  | 'positive_rep'
  | 'admin_warning'
  | 'dispute_resolved'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  related_handshake: string | null
  related_service: string | null
  created_at: string
}

// ─── Transaction Types ────────────────────────────────────────────────────────

export interface Transaction {
  id: string
  handshake_id?: string | null
  service_id?: string | null
  transaction_type: 'provision' | 'transfer' | 'refund' | 'adjustment'
  transaction_type_display: string
  service_type?: 'Offer' | 'Need' | 'Event' | null
  schedule_type?: 'One-Time' | 'Recurrent' | null
  max_participants?: number | null
  is_current_user_provider?: boolean
  counterpart: {
    id: string
    first_name: string
    last_name: string
    email: string
    avatar_url?: string | null
  } | null
  amount: number
  balance_after: number
  description: string
  service_title?: string | null
  created_at: string
}

// ─── Profile review (verified reviews on user profile) ───────────────────────

export interface CommentMediaItem {
  id: string
  file_url: string
}

export interface ProfileReview {
  id: string
  service: string
  service_title?: string
  user_id: string
  user_name: string
  user_avatar_url?: string
  user_karma_score?: number
  user_badges?: string[]
  user_featured_achievement_id?: string | null
  body: string
  is_verified_review: boolean
  handshake_hours?: number
  handshake_completed_at?: string
  /** Role the reviewed user had in the handshake: 'provider' or 'receiver' */
  reviewed_user_role?: 'provider' | 'receiver' | null
  reply_count: number
  replies: unknown[]
  media?: CommentMediaItem[]
  created_at: string
  updated_at: string
}

export interface ProfileReviewsResponse {
  count: number
  results: ProfileReview[]
  next?: string | null
  previous?: string | null
}

// ─── Reputation Types ─────────────────────────────────────────────────────────

export interface ReputationData {
  punctual?: boolean
  helpful?: boolean
  kindness?: boolean
  // Event-specific positive traits
  well_organized?: boolean
  engaging?: boolean
  welcoming?: boolean
  handshake_id: string
  comment?: string
}

export interface NegativeReputationData {
  handshake_id: string
  is_late?: boolean
  is_unhelpful?: boolean
  is_rude?: boolean
  // Event-specific negative traits
  disorganized?: boolean
  boring?: boolean
  unwelcoming?: boolean
  comment?: string
}

export interface ReputationResponse {
  id: string
  handshake: string
  giver: string
  giver_name: string
  receiver: string
  receiver_name: string
  comment?: string | null
  created_at: string
}

export interface PositiveReputationResponse extends ReputationResponse {
  is_punctual: boolean
  is_helpful: boolean
  is_kind: boolean
}

export interface NegativeReputationResponse extends ReputationResponse {
  is_late: boolean
  is_unhelpful: boolean
  is_rude: boolean
}

// ─── Admin Types ──────────────────────────────────────────────────────────────

export interface AdminReport {
  id: string
  reporter: string
  reporter_name: string
  reporter_email?: string | null
  reporter_karma_score?: number | null
  reporter_warning_count?: number | null
  reported_user?: string | null
  reported_user_name?: string | null
  reported_user_email?: string | null
  reported_user_karma_score?: number | null
  reported_service?: string | null
  reported_service_title?: string | null
  reported_service_status?: string | null
  reported_service_type?: string | null
  reported_service_description?: string | null
  reported_service_location?: string | null
  reported_service_hours?: number | null
  reported_service_owner?: string | null
  reported_service_owner_name?: string | null
  reported_service_owner_email?: string | null
  reported_service_owner_karma_score?: number | null
  reported_forum_topic?: string | null
  reported_forum_topic_title?: string | null
  reported_forum_post?: string | null
  reported_forum_post_excerpt?: string | null
  related_handshake?: string | null
  handshake_hours?: number | null
  handshake_scheduled_time?: string | null
  handshake_status?: string | null
  reported_user_is_receiver?: boolean | null
  type: 'no_show' | 'inappropriate_content' | 'service_issue' | 'spam' | 'scam' | 'harassment' | 'other'
  description: string
  status: 'pending' | 'resolved' | 'dismissed'
  admin_notes?: string | null
  created_at: string
  resolved_at?: string | null
  resolved_by?: string | null
}

export interface AdminUserSummary {
  id: string
  email: string
  first_name: string
  last_name: string
  avatar_url: string | null
  timebank_balance: number
  karma_score: number
  role: string
  is_active: boolean
  date_joined: string
}

export interface AdminTransaction {
  id: string
  transaction_type: 'provision' | 'transfer' | 'refund' | 'adjustment'
  amount: string
  balance_after: string
  description: string
  service_title: string | null
  service_id: string | null
  created_at: string
}

export interface AdminUserDetailAction {
  action_type: string
  reason: string | null
  created_at: string
}

export interface AdminUserDetail {
  id: string
  email: string
  first_name: string
  last_name: string
  bio: string | null
  avatar_url: string | null
  location: string | null
  role: string
  is_active: boolean
  is_verified: boolean
  is_onboarded: boolean
  date_joined: string
  last_login: string | null
  timebank_balance: number
  karma_score: number
  no_show_count: number
  is_event_banned_until: string | null
  is_organizer_banned_until: string | null
  locked_until: string | null
  offers_count: number
  requests_count: number
  events_count: number
  handshakes_as_requester_count: number
  handshakes_as_provider_count: number
  forum_topics_count: number
  recent_admin_actions: AdminUserDetailAction[]
  recent_offers?: { id: string; title: string }[]
  recent_requests?: { id: string; title: string }[]
  recent_events?: { id: string; title: string }[]
  recent_forum_topics?: { id: string; title: string }[]
  recent_handshakes_as_requester?: { id: string; title: string; service_id: string }[]
  recent_handshakes_as_provider?: { id: string; title: string; service_id: string }[]
  karma_adjustments?: { delta: number; karma: number; created_at: string; label: string }[]
}

export interface AdminUserDetailAction {
  action_type: string
  reason: string | null
  created_at: string
}

export interface AdminUserDetail {
  id: string
  email: string
  first_name: string
  last_name: string
  bio: string | null
  avatar_url: string | null
  location: string | null
  role: string
  is_active: boolean
  is_verified: boolean
  is_onboarded: boolean
  date_joined: string
  last_login: string | null
  timebank_balance: number
  karma_score: number
  no_show_count: number
  is_event_banned_until: string | null
  is_organizer_banned_until: string | null
  locked_until: string | null
  offers_count: number
  requests_count: number
  events_count: number
  handshakes_as_requester_count: number
  handshakes_as_provider_count: number
  forum_topics_count: number
  recent_admin_actions: AdminUserDetailAction[]
  recent_offers?: { id: string; title: string }[]
  recent_requests?: { id: string; title: string }[]
  recent_events?: { id: string; title: string }[]
  recent_forum_topics?: { id: string; title: string }[]
  recent_handshakes_as_requester?: { id: string; title: string; service_id: string }[]
  recent_handshakes_as_provider?: { id: string; title: string; service_id: string }[]
}

export interface AdminMetrics {
  timestamp: string
  users: {
    total: number
    active: number
    admins: number
  }
  services: {
    total: number
    active: number
    offers: number
    needs: number
  }
  handshakes: {
    total: number
    pending: number
    accepted: number
    completed: number
  }
  transactions: {
    total: number
    last_24h: number
  }
}

export interface AdminSettings {
  ranking_debug_enabled: boolean
  updated_at: string
}

export type AdminCommentStatus = 'active' | 'removed'

export interface AdminComment {
  id: string
  service: string
  service_title: string
  user_id: string
  user_name: string
  parent_id?: string | null
  body: string
  is_deleted: boolean
  status: AdminCommentStatus
  is_verified_review: boolean
  related_handshake?: string | null
  created_at: string
  updated_at: string
}

export interface AdminAuditLog {
  id: string
  admin: string
  admin_name: string
  action_type:
    | 'warn_user'
    | 'ban_user'
    | 'unban_user'
    | 'adjust_karma'
    | 'resolve_report'
    | 'pause_handshake'
    | 'remove_comment'
    | 'restore_comment'
    | 'lock_topic'
    | 'pin_topic'
    | 'assign_role'
  previous_role?: string | null
  new_role?: string | null
  ip_address?: string | null
  target_entity: 'user' | 'report' | 'handshake' | 'comment' | 'forum_topic'
  target_id: string
  reason?: string | null
  created_at: string
}

// ─── Forum Types ──────────────────────────────────────────────────────────────

export type ForumCategoryColor =
  | 'blue' | 'green' | 'purple' | 'amber' | 'orange' | 'pink' | 'red' | 'teal'

export interface ForumCategory {
  id: string
  name: string
  description: string
  slug: string
  icon: string
  color: ForumCategoryColor
  display_order: number
  is_active: boolean
  topic_count: number
  post_count: number
  last_activity: string | null
  created_at: string
  updated_at: string
}

export interface ForumTopic {
  id: string
  category: string
  category_name: string
  category_slug: string
  author_id: string
  author_name: string
  author_avatar_url: string | null
  title: string
  body: string
  is_pinned: boolean
  is_locked: boolean
  view_count: number
  reply_count: number
  last_activity: string
  created_at: string
  updated_at: string
  posts?: ForumPost[]
}

export interface ForumPost {
  id: string
  topic: string
  author_id: string
  author_name: string
  author_avatar_url: string | null
  body: string
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface ForumActivity {
  my_topics: number
  my_replies: number
  open_topics: number
}

// ─── Achievement / Badge Types ────────────────────────────────────────────────

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  badge_type: string
  threshold?: number
  earned_at?: string
}

export interface AchievementProgressAchievement {
  name: string
  description: string
  icon_url?: string | null
  karma_points?: number
  is_hidden?: boolean
}

export interface AchievementProgressItem {
  badge_type: string
  achievement: AchievementProgressAchievement
  earned: boolean
  current: number | null
  threshold: number | null
  progress_percent: number
  earned_at?: string | null
}

export interface BadgeProgress {
  badge_type: string
  name: string
  description: string
  current_value: number
  threshold: number
  earned: boolean
  earned_at?: string
  karma_points?: number
  is_hidden?: boolean
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  results: T[]
  count: number
  next: string | null
  previous: string | null
}

export interface TransactionSummary {
  current_balance: number
  total_earned: number
  total_spent: number
}

export interface PaginatedTransactionResponse extends PaginatedResponse<Transaction> {
  summary: TransactionSummary
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const POLLING_INTERVALS = {
  NOTIFICATIONS: 10_000,
  MESSAGES: 3_000,
  CONVERSATIONS: 15_000,
  SERVICES: 30_000,
  HANDSHAKE: 3_000,
} as const

export const DEBOUNCE_DELAYS = {
  SEARCH: 500,
  DISTANCE_SLIDER: 300,
  WIKIDATA_SEARCH: 300,
} as const

export const MAP_CONFIG = {
  DEFAULT_ZOOM: 11,
  FUZZY_RADIUS_METERS: 5000,
  SERVICE_FUZZY_RADIUS_METERS: 3000,
} as const

export const DISTANCE_SEARCH = {
  MIN_KM: 1,
  MAX_KM: 50,
  DEFAULT_KM: 10,
} as const
