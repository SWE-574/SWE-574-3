/**
 * useOfflineCommitments — composes the two payloads called out by FR-19b:
 * the user's active handshakes and the events they have joined.
 *
 * Both feed off the generic `useCachedFetch` so the cache + foreground
 * resync semantics are identical, and consumers get a single
 * `lastSyncedAt` they can show to the user.
 */
import { useCallback } from 'react';
import { listHandshakes, type Handshake } from '../api/handshakes';
import { useCachedFetch } from './useCachedFetch';

const ACTIVE_STATUSES = new Set([
  'pending',
  'accepted',
  'reported',
  'paused',
  'checked_in',
]);

const JOINED_EVENT_STATUSES = new Set([
  'accepted',
  'checked_in',
  'attended',
]);

async function fetchActiveCommitments(): Promise<{
  active_handshakes: Handshake[];
  joined_events: Handshake[];
}> {
  // Single round-trip — the listHandshakes endpoint already returns enough
  // metadata to split the two views client-side without a second call.
  const page = await listHandshakes({ page_size: 100 });
  const all = page.results ?? [];

  const active: Handshake[] = [];
  const joinedEvents: Handshake[] = [];

  for (const h of all) {
    const isEvent = h.service_type === 'Event';
    if (isEvent && JOINED_EVENT_STATUSES.has(h.status)) {
      joinedEvents.push(h);
    }
    if (!isEvent && ACTIVE_STATUSES.has(h.status)) {
      active.push(h);
    }
  }

  return { active_handshakes: active, joined_events: joinedEvents };
}

export function useOfflineCommitments(userId: string | null | undefined) {
  const fetcher = useCallback(fetchActiveCommitments, []);
  return useCachedFetch(userId, 'active-commitments', fetcher);
}
