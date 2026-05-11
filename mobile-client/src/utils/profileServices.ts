const PROFILE_ONGOING_STATUSES = new Set(["Active", "Agreed"]);

export function isOngoingProfileService(service: { status?: string | null }): boolean {
  return PROFILE_ONGOING_STATUSES.has(service.status ?? "");
}
