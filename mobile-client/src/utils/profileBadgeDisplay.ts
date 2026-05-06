import type { BadgeDetail } from "../api/calendar";

export function formatBadgeEarnedDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

export function getCompactBadgeTooltipText(badge: BadgeDetail): string {
  const parts = [badge.name, badge.description?.trim()];
  const earnedDate = formatBadgeEarnedDate(badge.earned_at);
  if (earnedDate) {
    parts.push(`Earned ${earnedDate}`);
  }
  return parts.filter(Boolean).join(" · ");
}
