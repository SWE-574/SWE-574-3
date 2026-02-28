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
  username?: string
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
  show_history?: boolean
  video_intro_url?: string | null
  video_intro_file_url?: string | null
  is_active?: boolean
  is_banned?: boolean
  is_admin?: boolean
  warning_count?: number
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
  type: 'Offer' | 'Need'
  duration: number | string
  location_type: 'In-Person' | 'Online'
  location_area?: string
  max_participants: number
  schedule_type: 'One-Time' | 'Recurrent'
  schedule_details?: string
  tags?: string[]
  tag_names?: string[]
}

export interface Service {
  id: string
  title: string
  description: string
  type: 'Offer' | 'Need'
  duration: number | string
  status: 'active' | 'inactive' | 'completed'
  location_type: 'In-Person' | 'Online'
  location_area?: string
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
  comment_count?: number
  hot_score?: number
}

export interface ServiceMedia {
  id: string
  file_url: string
  media_type: 'image' | 'video'
  order?: number
}

export interface Tag {
  id: string
  name: string
  wikidata_id?: string
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

export interface Notification {
  id: string
  recipient: string
  notification_type: string
  message: string
  is_read: boolean
  data?: Record<string, unknown>
  created_at: string
}

// ─── Transaction Types ────────────────────────────────────────────────────────

export interface Transaction {
  id: string
  user: string
  counterpart?: User
  transaction_type: 'credit' | 'debit'
  amount: number
  description: string
  handshake?: string
  created_at: string
}

// ─── Reputation Types ─────────────────────────────────────────────────────────

export interface ReputationData {
  punctual?: boolean
  helpful?: boolean
  kind?: boolean
  handshake_id: string
  recipient_id: string
}

// ─── Admin Types ──────────────────────────────────────────────────────────────

export interface AdminReport {
  id: string
  reporter: User
  reported_user?: User
  service?: Service
  handshake?: Handshake
  reason: string
  description: string
  status: 'open' | 'resolved' | 'dismissed'
  resolution_notes?: string
  created_at: string
  updated_at: string
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

export interface BadgeProgress {
  badge_type: string
  name: string
  description: string
  current_value: number
  threshold: number
  earned: boolean
  earned_at?: string
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  results: T[]
  count: number
  next: string | null
  previous: string | null
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
