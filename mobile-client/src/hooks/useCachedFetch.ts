/**
 * useCachedFetch — read-through offline cache hook for #322.
 *
 * On mount, reads the cache synchronously-ish (a short async read) and shows
 * the cached payload immediately. In parallel, fires `fetcher()` and
 * overwrites both state and the cache when fresh data arrives.
 *
 * On `AppState` 'active' transitions (the closest signal we have to a
 * "connectivity restored" event without adding a NetInfo dep) it refetches.
 *
 * Errors do not blow away cached data — the UI just keeps showing the last
 * known good payload with the `lastSyncedAt` indicator so the user knows
 * how stale it is.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  cacheKeyFor,
  readCache,
  saveCache,
  type CachedRead,
} from '../cache/offlineCache';
import { useConnectivityStore } from '../store/connectivityStore';

export interface CachedFetchState<T> {
  data: T | null;
  /** True while no payload has yet been resolved (neither cache nor network). */
  isLoading: boolean;
  /** True when the current `data` came from disk rather than this session's fetch. */
  isFromCache: boolean;
  /** Epoch ms; null if no cache and no successful fetch yet. */
  lastSyncedAt: number | null;
  error: string | null;
  /** Force a fresh network fetch; the cache is updated on success. */
  refresh: () => Promise<void>;
}

export interface UseCachedFetchOptions {
  /** When true, do not start the network fetch (e.g. before user logs in). */
  enabled?: boolean;
  /** Override the freshness window. */
  ttlMs?: number;
  /** When true, refetch on `AppState` 'active' transitions. Default true. */
  refetchOnForeground?: boolean;
}

export function useCachedFetch<T>(
  userId: string | null | undefined,
  slug: string,
  fetcher: () => Promise<T>,
  options: UseCachedFetchOptions = {},
): CachedFetchState<T> {
  const { enabled = true, ttlMs, refetchOnForeground = true } = options;
  const [state, setState] = useState<CachedFetchState<T>>({
    data: null,
    isLoading: enabled,
    isFromCache: false,
    lastSyncedAt: null,
    error: null,
    refresh: async () => {},
  });

  // Hold the latest fetcher so AppState handlers always see the current closure.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const slugRef = useRef(slug);
  slugRef.current = slug;

  const runFetch = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      const data = await fetcherRef.current();
      saveCache(cacheKeyFor(uid, slugRef.current), data);
      setState((prev) => ({
        ...prev,
        data,
        isLoading: false,
        isFromCache: false,
        lastSyncedAt: Date.now(),
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        // Preserve cached data on failure — do not clear it.
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to refresh',
      }));
    }
  }, []);

  // Initial cache read + first fetch.
  useEffect(() => {
    if (!enabled || !userId) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }

    let cancelled = false;
    (async () => {
      const cached: CachedRead<T> | null = await readCache(cacheKeyFor(userId, slug), ttlMs);
      if (cancelled) return;
      if (cached) {
        setState((s) => ({
          ...s,
          data: cached.data,
          isFromCache: true,
          lastSyncedAt: cached.cachedAt,
          // If the cache is fresh, we still let the network fetch happen but
          // the user already sees usable content — no spinner.
          isLoading: !cached.fresh,
        }));
      }
      await runFetch();
    })();

    return () => {
      cancelled = true;
    };
    // We deliberately do not depend on `runFetch` (stable via refs) so the
    // hook fetches once per (userId, slug) pair plus on-foreground.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, slug, enabled, ttlMs]);

  // Refetch on foreground transitions — closest thing to "online again"
  // for backgrounded apps where the connectivity listener was suspended.
  useEffect(() => {
    if (!enabled || !refetchOnForeground || !userId) return;
    const handler = (next: AppStateStatus) => {
      if (next === 'active') {
        void runFetch();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [enabled, refetchOnForeground, userId, runFetch]);

  // Refetch when connectivity transitions offline -> online so cached
  // surfaces resync without the user pulling-to-refresh.
  useEffect(() => {
    if (!enabled || !userId) return;
    let prevOnline = useConnectivityStore.getState().isOnline;
    const unsub = useConnectivityStore.subscribe((next) => {
      if (!prevOnline && next.isOnline) {
        void runFetch();
      }
      prevOnline = next.isOnline;
    });
    return unsub;
  }, [enabled, userId, runFetch]);

  // Memoised refresh handle for the consumer's pull-to-refresh button.
  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    await runFetch();
  }, [runFetch]);

  return { ...state, refresh };
}
