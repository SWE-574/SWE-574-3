import { create } from 'zustand'

interface GeoState {
  geoLocation: { latitude: number; longitude: number } | null
  setGeoLocation: (geoLocation: { latitude: number; longitude: number }) => void
}

export const useGeoStore = create<GeoState>()((set) => ({
  geoLocation: { latitude: 0, longitude: 0 },
  setGeoLocation: (geoLocation) => set({ geoLocation }),
}))
