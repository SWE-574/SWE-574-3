import { DISTANCE_SEARCH, MAP_CONFIG } from '@/types'

/**
 * Calculate the distance between two coordinates in kilometres (Haversine formula)
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

/**
 * Add a random offset to coordinates for privacy (fuzzy location)
 */
export function fuzzyCoordinates(
  lat: number,
  lon: number,
  radiusMeters = MAP_CONFIG.FUZZY_RADIUS_METERS,
): { lat: number; lon: number } {
  const radiusDeg = radiusMeters / 111_000
  const u = Math.random()
  const v = Math.random()
  const w = radiusDeg * Math.sqrt(u)
  const t = 2 * Math.PI * v
  return {
    lat: lat + w * Math.cos(t),
    lon: lon + w * Math.sin(t),
  }
}

/**
 * Get current position using the Geolocation API
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 300_000,
    })
  })
}

/**
 * Clamp distance value within valid search range
 */
export function clampDistance(km: number): number {
  return Math.min(Math.max(km, DISTANCE_SEARCH.MIN_KM), DISTANCE_SEARCH.MAX_KM)
}

// ─── Mapbox reverse geocoding (for handshake address picker) ───────────────────

interface MapboxFeature {
  place_name?: string
  text?: string
  center?: [number, number]
  context?: Array<{ id: string; text: string }>
}

/**
 * Reverse geocode lng,lat to a human-readable address using Mapbox.
 * Returns the best available address string (place_name) or null if the request fails or returns no features.
 */
export async function reverseGeocode(
  lng: number,
  lat: number,
  accessToken: string,
): Promise<{ address: string } | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${accessToken}&types=address,neighborhood,locality,place&language=en&limit=1`
  try {
    const res = await fetch(url)
    const data = (await res.json()) as { features?: MapboxFeature[] }
    const f = data.features?.[0]
    if (!f?.place_name) return null
    return { address: f.place_name }
  } catch {
    return null
  }
}

/**
 * Build a Google Maps URL that opens a search for the given address (directions/navigation).
 */
export function buildMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
