import { create } from 'zustand'

interface GeoState {
  geoLocation: { latitude: number; longitude: number } | null
  setGeoLocation: (geoLocation: { latitude: number; longitude: number } | null) => void
}

export const useGeoStore = create<GeoState>()((set) => ({
  geoLocation: null,
  setGeoLocation: (geoLocation) => set({ geoLocation }),
}))
