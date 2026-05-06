/**
 * Offline cache for the mobile client (#322 / FR-19b, NFR-19b).
 *
 * Persists JSON payloads to the app cache directory using expo-file-system.
 * Backed by `Paths.cache` (not `Paths.document`) on purpose — this is a
 * read-cache, not source-of-truth state, and the OS may evict it under
 * storage pressure without losing user data.
 *
 * Each entry is `{ data, cachedAt }`. Readers get a `freshness` flag based
 * on a configurable TTL so the UI can show a "last synced N minutes ago"
 * banner without each caller reimplementing the math.
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { UserSummary } from '../api/types';

export interface CacheEntry<T> {
  data: T;
  /** Unix epoch milliseconds when the entry was written. */
  cachedAt: number;
}

export interface CachedRead<T> extends CacheEntry<T> {
  /** True when the cache is still considered fresh per `ttlMs`. */
  fresh: boolean;
}

const ROOT_DIR_NAME = 'hive-offline-cache';
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h fresh by default

function rootDir(): Directory {
  const dir = new Directory(Paths.cache, ROOT_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/** Sanitises a cache key into a file-system safe filename. */
function fileFor(key: string): File {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return new File(rootDir(), `${safe}.json`);
}

export function cacheKeyFor(userId: string, slug: string): string {
  return `u_${userId}__${slug}`;
}

export function saveCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
  const file = fileFor(key);
  // The legacy `writeAsStringAsync` API is removed in expo-file-system v19;
  // the new File class uses sync `write` for small JSON blobs which is fine
  // at this size class (<200KB per file).
  if (file.exists) {
    file.write(JSON.stringify(entry));
  } else {
    file.create();
    file.write(JSON.stringify(entry));
  }
}

export async function readCache<T>(
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<CachedRead<T> | null> {
  const file = fileFor(key);
  if (!file.exists) return null;
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (typeof parsed?.cachedAt !== 'number') return null;
    return {
      ...parsed,
      fresh: Date.now() - parsed.cachedAt < ttlMs,
    };
  } catch {
    // Corrupt entry — treat as missing; the next save will overwrite.
    return null;
  }
}

export function clearCache(key?: string): void {
  if (key) {
    const file = fileFor(key);
    if (file.exists) file.delete();
    return;
  }
  const dir = rootDir();
  if (dir.exists) dir.delete();
}

/**
 * Singleton key for the currently signed-in user's snapshot.
 *
 * Lives outside the per-user (`u_{userId}__...`) namespace because at app
 * startup we have tokens in SecureStore but do not yet know the user id —
 * so the shell hydrates from this slot before `getMe()` resolves.
 */
const CURRENT_USER_KEY = 'current-user-snapshot';

export function saveCurrentUser(user: UserSummary): void {
  saveCache(CURRENT_USER_KEY, user);
}

export function readCurrentUser(): Promise<CachedRead<UserSummary> | null> {
  // No TTL — staleness is signalled separately via AuthContext.isStale.
  return readCache<UserSummary>(CURRENT_USER_KEY, Number.POSITIVE_INFINITY);
}

export function clearCurrentUser(): void {
  clearCache(CURRENT_USER_KEY);
}

/**
 * Wipe every per-user cache file for `userId`. Used on logout / account
 * switch so a new user does not see the previous account's data.
 */
export function clearAllUserCaches(userId: string): void {
  const dir = rootDir();
  if (!dir.exists) return;
  const prefix = `u_${userId}__`;
  // expo-file-system Directory exposes `list()` returning Files/Directories.
  for (const entry of dir.list()) {
    const name = entry.name ?? '';
    if (name.startsWith(prefix) && entry instanceof File) {
      entry.delete();
    }
  }
}

export function formatLastSynced(cachedAt: number, now: number = Date.now()): string {
  const ms = Math.max(0, now - cachedAt);
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
