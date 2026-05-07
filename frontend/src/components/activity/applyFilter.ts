import type { ActivityEvent } from '@/services/activityAPI'
import type { ActivityFilter } from './ActivityFilterChips'

const RECENT_HOURS = 24

export function applyFilter(
  events: ActivityEvent[],
  filter: ActivityFilter,
  followingIds: Set<string>,
): ActivityEvent[] {
  if (filter === 'all') return events
  if (filter === 'recent') {
    const cutoff = Date.now() - RECENT_HOURS * 3_600_000
    return events.filter(e => new Date(e.created_at).getTime() >= cutoff)
  }
  if (filter === 'nearby') {
    return events.filter(e => e.distance_km != null)
  }
  if (filter === 'following') {
    return events.filter(e => followingIds.has(e.actor.id))
  }
  return events
}
