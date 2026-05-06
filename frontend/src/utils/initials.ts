export interface UserLike {
  first_name?: string
  last_name?: string
  email?: string
  avatar_url?: string | null
}

export function initials(u?: UserLike | null) {
  if (!u) return '?'
  const f = u.first_name?.[0] ?? ''
  const l = u.last_name?.[0] ?? ''
  return f || l ? `${f}${l}`.toUpperCase() : (u.email?.[0] ?? '?').toUpperCase()
}
