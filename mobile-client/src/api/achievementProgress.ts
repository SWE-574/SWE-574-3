/**
 * GET /users/{id}/badge-progress/ — full achievement progress (web parity).
 */

import { apiRequest } from "./client";

export interface AchievementProgressAchievement {
  name: string;
  description: string;
  icon_url?: string | null;
  karma_points?: number;
  is_hidden?: boolean;
}

export interface AchievementProgressItem {
  badge_type: string;
  achievement: AchievementProgressAchievement;
  earned: boolean;
  current: number | null;
  threshold: number | null;
  progress_percent: number;
  earned_at?: string | null;
}

type RawAchievementProgressEntry = {
  achievement?: {
    name?: string;
    description?: string;
    icon_url?: string | null;
    karma_points?: number;
    is_hidden?: boolean;
  };
  badge?: {
    name?: string;
    description?: string;
    icon_url?: string | null;
    karma_points?: number;
    is_hidden?: boolean;
  };
  earned?: boolean;
  current?: number | null;
  threshold?: number | null;
  progress_percent?: number;
  earned_at?: string | null;
};

type RawAchievementProgressResponse =
  | Record<string, RawAchievementProgressEntry>
  | { results?: AchievementProgressItem[] | RawAchievementProgressEntry[] }
  | AchievementProgressItem[]
  | RawAchievementProgressEntry[];

function normalizeAchievementProgress(
  data: RawAchievementProgressResponse,
): AchievementProgressItem[] {
  if (Array.isArray(data)) {
    return data.map((entry, index) => {
      const typed = entry as AchievementProgressItem & RawAchievementProgressEntry;
      const nested = typed.achievement ?? typed.badge ?? {};
      return {
        badge_type: typed.badge_type ?? `achievement-${index}`,
        achievement: {
          name: nested.name ?? "Achievement",
          description: nested.description ?? "",
          icon_url: nested.icon_url ?? null,
          karma_points: nested.karma_points ?? 0,
          is_hidden: nested.is_hidden ?? false,
        },
        earned: Boolean(typed.earned),
        current: typed.current ?? null,
        threshold: typed.threshold ?? null,
        progress_percent: typed.progress_percent ?? 0,
        earned_at: typed.earned_at ?? null,
      };
    });
  }

  if (data && typeof data === "object" && "results" in data) {
    const r = (data as { results?: unknown }).results;
    if (Array.isArray(r)) {
      return normalizeAchievementProgress(
        r as RawAchievementProgressResponse,
      );
    }
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const skip = new Set(["results", "count", "next", "previous"]);
    return Object.entries(data as Record<string, RawAchievementProgressEntry>)
      .filter(([k]) => !skip.has(k))
      .map(([badgeType, entry]) => {
        const nested = entry.achievement ?? entry.badge ?? {};
        return {
          badge_type: badgeType,
          achievement: {
            name: nested.name ?? badgeType,
            description: nested.description ?? "",
            icon_url: nested.icon_url ?? null,
            karma_points: nested.karma_points ?? 0,
            is_hidden: nested.is_hidden ?? false,
          },
          earned: Boolean(entry.earned),
          current: entry.current ?? null,
          threshold: entry.threshold ?? null,
          progress_percent: entry.progress_percent ?? 0,
          earned_at: entry.earned_at ?? null,
        };
      },
    );
  }

  return [];
}

export async function getAchievementProgress(
  userId: string,
): Promise<AchievementProgressItem[]> {
  const raw = await apiRequest<RawAchievementProgressResponse>(
    `/users/${userId}/badge-progress/`,
  );
  return normalizeAchievementProgress(raw);
}
