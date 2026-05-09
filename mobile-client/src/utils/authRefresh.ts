export const USER_SOFT_REFRESH_MIN_INTERVAL_MS = 30_000;

export function shouldSkipSoftUserRefresh({
  force,
  lastConfirmedAt,
  now,
  minIntervalMs = USER_SOFT_REFRESH_MIN_INTERVAL_MS,
}: {
  force: boolean;
  lastConfirmedAt: number;
  now: number;
  minIntervalMs?: number;
}): boolean {
  return !force && lastConfirmedAt > 0 && now - lastConfirmedAt < minIntervalMs;
}
