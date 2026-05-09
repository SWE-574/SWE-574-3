export function profileDataUserId(user: { id?: string | number | null } | null | undefined): string | null {
  if (user?.id == null) return null
  return String(user.id)
}
