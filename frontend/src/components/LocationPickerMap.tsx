/**
 * LocationPickerMap — Mapbox-based location picker for handshake exact location.
 * User clicks the map or uses "Use My Location"; the selected point is reverse-geocoded
 * to a human-readable address. Value is the resolved address (not coordinates).
 * Shows selected address with an "Open in Maps" navigation link.
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/mapbox'
import type { MapRef, LayerProps } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import type { MapMouseEvent } from 'mapbox-gl'
import type { Feature, FeatureCollection, Point } from 'geojson'
import 'mapbox-gl/dist/mapbox-gl.css'

import { Box, Button, Input, Text, Link } from '@chakra-ui/react'
import { GREEN, GRAY100, GRAY200, GRAY400, GRAY700, GRAY800, WHITE } from '@/theme/tokens'
import { reverseGeocode, buildMapsUrl } from '@/utils/location'

const mapboxWithTelemetry = mapboxgl as typeof mapboxgl & { setTelemetryEnabled?: (enabled: boolean) => void }
if (typeof mapboxWithTelemetry.setTelemetryEnabled === 'function') {
  mapboxWithTelemetry.setTelemetryEnabled(false)
}

const ISTANBUL_CENTER = { longitude: 28.9784, latitude: 41.0082, zoom: 11 }
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export interface LocationPickerMapProps {
  value: string
  onChange: (value: string) => void
  height?: string
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
  height = '220px',
}: {
  value: string
  onChange: (value: string) => void
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
          Set VITE_MAPBOX_TOKEN in .env to enable the map. You can enter an address below.
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
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null)

  const pinGeoJSON = useMemo((): FeatureCollection<Point> => {
    if (!selectedCoords) return { type: 'FeatureCollection', features: [] }
    const feature: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [selectedCoords.lng, selectedCoords.lat] },
      properties: {},
    }
    return { type: 'FeatureCollection', features: [feature] }
  }, [selectedCoords])

  const initialView = useMemo(() => {
    if (selectedCoords) return { longitude: selectedCoords.lng, latitude: selectedCoords.lat, zoom: 14 }
    return { ...ISTANBUL_CENTER }
  }, [selectedCoords])

  const resolveAndSet = useCallback(
    async (lng: number, lat: number) => {
      if (!TOKEN) return
      setLocationError(null)
      const result = await reverseGeocode(lng, lat, TOKEN)
      if (result) {
        setSelectedCoords({ lat, lng })
        onChange(result.address)
      } else {
        setLocationError('Could not resolve address for this location. Try another spot or enter an address manually.')
      }
    },
    [onChange]
  )

  const requestLocation = useCallback(() => {
    setLocationError(null)
    setLocationLoading(true)
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported')
      setLocationLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        await resolveAndSet(lng, lat)
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
  }, [resolveAndSet])

  const onMapClick = useCallback(
    async (e: MapMouseEvent) => {
      const { lng, lat } = e.lngLat
      setLocationLoading(true)
      await resolveAndSet(lng, lat)
      setLocationLoading(false)
    },
    [resolveAndSet]
  )

  if (!TOKEN) {
    return (
      <MapFallback
        value={value}
        onChange={onChange}
        height={height}
      />
    )
  }

  return (
    <Box width="100%">
      {/* Map and "Use My Location" live in their own container so the button never overlaps the input below */}
      <Box position="relative" width="100%" sx={{ height }}>
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
          {selectedCoords && (
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
          loading={locationLoading}
          bg={WHITE}
          borderColor={GRAY200}
          _hover={{ bg: GRAY100 }}
        >
          <LocationIcon />
          <Box as="span" ml={2}>Use My Location</Box>
        </Button>
      </Box>
      {locationError && (
        <Text fontSize="12px" color="red.500" mt={1}>
          {locationError}
        </Text>
      )}
      <Box mt={3}>
        <Text fontSize="12px" color={GRAY700} fontWeight={500} mb={1}>
          Exact Location
        </Text>
        <Input
          placeholder="e.g. Nagihan Sokak 3, Çekmeköy"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          size="sm"
          borderRadius="8px"
          borderColor={GRAY200}
        />
        {value.trim() && (
          <Link
            href={buildMapsUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            fontSize="13px"
            fontWeight={600}
            color={GREEN}
            mt={2}
            display="inline-block"
            _hover={{ textDecoration: 'underline' }}
          >
            Open in Maps
          </Link>
        )}
      </Box>
    </Box>
  )
}
