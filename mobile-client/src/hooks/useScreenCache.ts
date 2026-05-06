/**
 * Tiny offline-cache companion for screens with their own existing fetch
 * flow (HomeScreen, MessagesScreen, ServiceDetailScreen).
 *
 * Unlike `useCachedFetch`, this hook does NOT own the fetch lifecycle. It
 * just exposes two helpers the screen can call from its own load logic:
 *
 *   const cache = useScreenCache<Service[]>(userId, 'home-feed-default');
 *   await cache.persist(results);     // after a successful fetch
 *   const seed = await cache.hydrate(); // on cold start / fetch failure
 *
 * Keeps the screen's existing state machine intact — just adds a disk-backed
 * fallback so the user sees something rather than an empty list when offline.
 */
import { useMemo } from "react";
import {
  cacheKeyFor,
  readCache,
  saveCache,
} from "../cache/offlineCache";

export interface ScreenCacheSeed<T> {
  data: T;
  cachedAt: number;
}

export interface ScreenCache<T> {
  hydrate(): Promise<ScreenCacheSeed<T> | null>;
  persist(data: T): void;
  /** True when the hook has a usable user id and slug. */
  enabled: boolean;
}

export function useScreenCache<T>(
  userId: string | null | undefined,
  slug: string,
): ScreenCache<T> {
  return useMemo<ScreenCache<T>>(() => {
    const enabled = Boolean(userId);
    return {
      enabled,
      async hydrate() {
        if (!userId) return null;
        // No TTL — staleness is communicated by the screen UI, not by
        // dropping stale-but-useful payloads on the floor.
        const c = await readCache<T>(
          cacheKeyFor(userId, slug),
          Number.POSITIVE_INFINITY,
        );
        return c ? { data: c.data, cachedAt: c.cachedAt } : null;
      },
      persist(data) {
        if (!userId) return;
        try {
          saveCache(cacheKeyFor(userId, slug), data);
        } catch {
          /* cache write failures are non-fatal */
        }
      },
    };
  }, [userId, slug]);
}
