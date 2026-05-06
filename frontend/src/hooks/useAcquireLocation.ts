import { useEffect } from 'react'
import { useGeoStore } from '@/store/useGeoStore'
import { getCurrentPosition } from '@/utils/location'

// On mount, if we have prior consent (locationEnabled in localStorage) but
// no coords in the geo store yet, re-acquire from the browser. This covers
// users who land on a page like /activity directly without going through
// the dashboard, where the original consent + acquisition happens.
export function useAcquireLocation() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (useGeoStore.getState().geoLocation != null) return
    if (localStorage.getItem('locationEnabled') !== 'true') return
    let cancelled = false
    getCurrentPosition()
      .then(pos => {
        if (cancelled) return
        useGeoStore.getState().setGeoLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
}
