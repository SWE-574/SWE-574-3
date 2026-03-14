/**
 * Format ISO date string to relative time (e.g. "15m ago", "7h ago").
 */
export function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) {
    return "just now";
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
