/**
 * LocationPickerMap — Mapbox-based location picker for handshake exact location.
 * User can click the map to set a pin or use "Use My Location" (Geolocation API).
 * Value is stored as "lat,lng" for backend exact_location (CharField).
 * When VITE_MAPBOX_TOKEN is missing, shows a text fallback and still supports "Use My Location".
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/mapbox'
import type { MapRef, LayerProps } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import type { MapMouseEvent } from 'mapbox-gl'
import type { Feature, Point } from 'geojson'
import 'mapbox-gl/dist/mapbox-gl.css'

const mapboxWithTelemetry = mapboxgl as typeof mapboxgl & { setTelemetryEnabled?: (enabled: boolean) => void }
if (typeof mapboxWithTelemetry.setTelemetryEnabled === 'function') {
  mapboxWithTelemetry.setTelemetryEnabled(false)
}

import { Box, Button, Input, Text } from '@chakra-ui/react'
import { GREEN, GRAY100, GRAY200, GRAY400, GRAY700, WHITE } from '@/theme/tokens'

const ISTANBUL_CENTER = { longitude: 28.9784, latitude: 41.0082, zoom: 11 }
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export interface LocationPickerMapProps {
  value: string
  onChange: (value: string) => void
  height?: string
}

function parseLatLng(value: string): { lat: number; lng: number } | null {
  if (!value || !value.trim()) return null
  const parts = value.trim().split(',')
  if (parts.length < 2) return null
  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])
  if (isNaN(lat) || isNaN(lng)) return null
  return { lat, lng }
}

const pinLayer: LayerProps = {
  id: 'pick-marker',
  type: 'circle',
  paint: {
    'circle-radius': 10,
    'circle-color': GREEN,
    'circle-stroke-width': 3,
    'circle-stroke-color': WHITE,
  },
}

function MapFallback({
  value,
  onChange,
  onUseMyLocation,
  locationLoading,
  locationError,
  height = '220px',
}: {
  value: string
  onChange: (value: string) => void
  onUseMyLocation: () => void
  locationLoading: boolean
  locationError: string | null
  height?: string
}) {
  return (
    <Box>
      <Box
        height={height}
        width="100%"
        borderRadius="8px"
        bg={GRAY100}
        border="1px solid"
        borderColor={GRAY200}
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap={2}
        color={GRAY400}
      >
        <Text fontSize="13px" fontWeight={500} color={GRAY700}>
          Map unavailable
        </Text>
        <Text fontSize="12px" color={GRAY400}>
          Set VITE_MAPBOX_TOKEN in .env to enable the map. You can still enter an address or use your location.
        </Text>
      </Box>
      <Input
        placeholder="e.g. Beşiktaş Library, Room 3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size="sm"
        borderRadius="8px"
        mt={2}
      />
      <Button
        size="sm"
        variant="outline"
        mt={2}
        onClick={onUseMyLocation}
        isLoading={locationLoading}
      >
        <LocationIcon />
        <Box as="span" ml={2}>Use My Location</Box>
      </Button>
      {locationError && (
        <Text fontSize="12px" color="red.500" mt={1}>
          {locationError}
        </Text>
      )}
    </Box>
  )
}

function LocationIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  )
}

export function LocationPickerMap({ value, onChange, height = '220px' }: LocationPickerMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const coords = useMemo(() => parseLatLng(value), [value])

  const pinGeoJSON = useMemo((): GeoJSON.FeatureCollection<Point> => {
    if (!coords) return { type: 'FeatureCollection', features: [] }
    const feature: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
      properties: {},
    }
    return { type: 'FeatureCollection', features: [feature] }
  }, [coords])

  const initialView = useMemo(() => {
    if (coords) return { longitude: coords.lng, latitude: coords.lat, zoom: 14 }
    return { ...ISTANBUL_CENTER }
  }, [coords])

  const requestLocation = useCallback(() => {
    setLocationError(null)
    setLocationLoading(true)
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported')
      setLocationLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        onChange(`${lat},${lng}`)
        setLocationLoading(false)
        mapRef.current?.flyTo({
          center: [lng, lat],
          zoom: 14,
          duration: 700,
        })
      },
      (err) => {
        setLocationError(
          ['Unknown error', 'Permission denied', 'Location unavailable', 'Timed out'][err.code] ?? 'Unable to get location'
        )
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    )
  }, [onChange])

  const onMapClick = useCallback(
    (e: MapMouseEvent) => {
      const { lng, lat } = e.lngLat
      onChange(`${lat},${lng}`)
    },
    [onChange]
  )

  if (!TOKEN) {
    return (
      <MapFallback
        value={value}
        onChange={onChange}
        onUseMyLocation={requestLocation}
        locationLoading={locationLoading}
        locationError={locationError}
        height={height}
      />
    )
  }

  return (
    <Box position="relative" width="100%">
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={initialView}
        style={{ width: '100%', height, borderRadius: '8px' }}
        mapStyle="mapbox://styles/sgunes16/cmmc96rwc00c701qz7v0g8h9k"
        scrollZoom
        onClick={onMapClick}
        cursor="crosshair"
      >
        <NavigationControl position="top-right" showCompass={false} />
        {coords && (
          <Source id="pick-marker-source" type="geojson" data={pinGeoJSON}>
            <Layer {...pinLayer} />
          </Source>
        )}
      </Map>
      <Button
        size="sm"
        variant="outline"
        position="absolute"
        bottom="10px"
        right="10px"
        onClick={requestLocation}
        isLoading={locationLoading}
        bg={WHITE}
        borderColor={GRAY200}
        _hover={{ bg: GRAY100 }}
      >
        <LocationIcon />
        <Box as="span" ml={2}>Use My Location</Box>
      </Button>
      {locationError && (
        <Text fontSize="12px" color="red.500" mt={1}>
          {locationError}
        </Text>
      )}
    </Box>
  )
}
