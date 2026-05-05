import type { ActivityActor, ActivityServiceRef } from '@/services/activityAPI'

// Type-tinted gradients used as the hero background fallback when a service
// has no media. Mirror of the dashboard's pickGradient palette but expressed
// as the simpler shape ForYouCarousel uses.
export const TYPE_GRADIENT: Record<ActivityServiceRef['type'], string> = {
  Offer: 'linear-gradient(135deg, #16a34a 0%, #166534 100%)',
  Need: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  Event: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
}

export function actorName(a?: ActivityActor | null): string {
  if (!a) return 'Someone'
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Someone'
}

export function actorAvatarStub(a: ActivityActor) {
  return {
    first_name: a.first_name,
    last_name: a.last_name,
    avatar_url: a.avatar_url || undefined,
  }
}

export function distanceLabel(km: number | null | undefined): string | null {
  if (km == null) return null
  if (km < 0.1) return 'right here'
  if (km < 1) return `${Math.round(km * 1000)} m away`
  return `${km.toFixed(1)} km away`
}

export function startsInLabel(seconds: number | null | undefined): string | null {
  if (seconds == null) return null
  if (seconds < 0) return 'happening now'
  if (seconds < 3600) return `starts in ${Math.max(1, Math.floor(seconds / 60))}m`
  if (seconds < 86400) return `starts in ${Math.floor(seconds / 3600)}h`
  return `starts in ${Math.floor(seconds / 86400)}d`
}
