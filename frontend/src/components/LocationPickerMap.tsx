/**
 * LocationPickerMap — Mapbox-based location picker for handshake exact location.
 * User clicks the map or uses "Use My Location"; the selected point is reverse-geocoded
 * to a human-readable address. Value is the resolved address (not coordinates).
 * Shows selected address with an "Open in Google Maps" link.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/mapbox'
import type { MapRef, LayerProps } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import type { MapMouseEvent } from 'mapbox-gl'
import type { Feature, FeatureCollection, Point } from 'geojson'
import 'mapbox-gl/dist/mapbox-gl.css'

import { Box, Button, Flex, Input, Link, Spinner, Text } from '@chakra-ui/react'
import { GREEN, GRAY100, GRAY200, GRAY400, GRAY700, WHITE } from '@/theme/tokens'
import { reverseGeocode, buildMapsUrl, searchLocations } from '@/utils/location'

const mapboxWithTelemetry = mapboxgl as typeof mapboxgl & { setTelemetryEnabled?: (enabled: boolean) => void }
if (typeof mapboxWithTelemetry.setTelemetryEnabled === 'function') {
  mapboxWithTelemetry.setTelemetryEnabled(false)
}

const ISTANBUL_CENTER = { longitude: 28.9784, latitude: 41.0082, zoom: 11 }
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export interface LocationPickerMapProps {
  value: string
  onChange: (
    value: string,
    coords?: { lat: number; lng: number } | null,
    meta?: { district?: string | null; fullAddress?: string | null },
  ) => void
  height?: string
  coords?: { lat: number; lng: number } | null
  mapsUrl?: string | null
  showSearchInput?: boolean
  auxiliaryLabel?: string
  auxiliaryValue?: string
  auxiliaryPlaceholder?: string
  onAuxiliaryChange?: (value: string) => void
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
  onChange: (value: string, coords?: { lat: number; lng: number } | null) => void
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
        onChange={(e) => onChange(e.target.value, null)}
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

export function LocationPickerMap({
  value,
  onChange,
  height = '220px',
  coords = null,
  mapsUrl,
  showSearchInput = true,
  auxiliaryLabel,
  auxiliaryValue,
  auxiliaryPlaceholder,
  onAuxiliaryChange,
}: LocationPickerMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState(value)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<Array<{
    id: string
    address: string
    district: string | null
    lat: number
    lng: number
  }>>([])
  const [showResults, setShowResults] = useState(false)
  const showAuxiliaryField = auxiliaryLabel !== undefined || auxiliaryValue !== undefined || onAuxiliaryChange !== undefined
  const autoResolvedValueRef = useRef<string | null>(null)

  useEffect(() => {
    setSelectedCoords(coords)
  }, [coords])

  useEffect(() => {
    setSearchQuery(value)
  }, [value])

  useEffect(() => {
    if (coords) {
      mapRef.current?.flyTo({
        center: [coords.lng, coords.lat],
        zoom: 14,
        duration: 700,
      })
    }
  }, [coords])

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
        onChange(result.address, { lat, lng }, { district: result.district, fullAddress: result.address })
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

  useEffect(() => {
    if (!TOKEN || !searchQuery.trim() || searchQuery.trim().length < 2 || searchQuery.trim() === value.trim()) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    let cancelled = false
    setSearchLoading(true)
    const timer = window.setTimeout(async () => {
      const results = await searchLocations(searchQuery.trim(), TOKEN)
      if (cancelled) return
      setSearchResults(results)
      setSearchLoading(false)
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery, value])

  const handleSelectSearchResult = useCallback((result: {
    address: string
    district: string | null
    lat: number
    lng: number
  }) => {
    setSearchQuery(result.address)
    setSearchResults([])
    setShowResults(false)
    setSelectedCoords({ lat: result.lat, lng: result.lng })
    onChange(
      result.address,
      { lat: result.lat, lng: result.lng },
      { district: result.district, fullAddress: result.address },
    )
    mapRef.current?.flyTo({
      center: [result.lng, result.lat],
      zoom: 14,
      duration: 700,
    })
  }, [onChange])

  useEffect(() => {
    if (!TOKEN || coords || !value.trim()) return
    if (autoResolvedValueRef.current === value.trim()) return

    let cancelled = false
    autoResolvedValueRef.current = value.trim()

    const timer = window.setTimeout(async () => {
      const results = await searchLocations(value.trim(), TOKEN)
      if (cancelled || results.length === 0) return
      handleSelectSearchResult(results[0])
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [coords, value, handleSelectSearchResult])

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
      {showSearchInput && (
        <Box position="relative" mb={3}>
          <Input
            placeholder="Search address and select a result"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowResults(true)
            }}
            onFocus={() => {
              if (searchResults.length > 0) setShowResults(true)
            }}
            onBlur={() => window.setTimeout(() => setShowResults(false), 160)}
            size="sm"
            borderRadius="8px"
            borderColor={GRAY200}
          />
          {showResults && (searchLoading || searchResults.length > 0) && (
            <Box
              position="absolute"
              zIndex={20}
              top="calc(100% + 6px)"
              left={0}
              right={0}
              bg={WHITE}
              border="1px solid"
              borderColor={GRAY200}
              borderRadius="12px"
              boxShadow="0 8px 24px rgba(0,0,0,0.12)"
              maxH="240px"
              overflowY="auto"
            >
              {searchLoading && <Flex justify="center" p={3}><Spinner size="sm" /></Flex>}
              {!searchLoading && searchResults.map((result) => (
                <Box
                  key={result.id}
                  px={4}
                  py="10px"
                  cursor="pointer"
                  _hover={{ bg: GRAY100 }}
                  onMouseDown={() => handleSelectSearchResult(result)}
                >
                  <Text fontSize="13px" color={GRAY700} fontWeight={600}>{result.address}</Text>
                  {result.district && (
                    <Text fontSize="11px" color={GRAY400} mt="1px">{result.district}</Text>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
      {/* Map and "Use My Location" live in their own container so the button never overlaps the input below */}
      <Box position="relative" width="100%" height={height}>
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
      {showAuxiliaryField && (
        <Box mt={3}>
          {auxiliaryLabel && (
            <Text fontSize="12px" color={GRAY700} fontWeight={500} mb={1}>
              {auxiliaryLabel}
            </Text>
          )}
          <Input
            placeholder={auxiliaryPlaceholder}
            value={auxiliaryValue ?? value}
            onChange={(e) => {
              if (onAuxiliaryChange) {
                onAuxiliaryChange(e.target.value)
                return
              }
              setSelectedCoords(null)
              onChange(e.target.value, null)
            }}
            size="sm"
            borderRadius="8px"
            borderColor={GRAY200}
          />
          {(mapsUrl || (selectedCoords ? `https://www.google.com/maps?q=${selectedCoords.lat},${selectedCoords.lng}` : (value.trim() ? buildMapsUrl(value) : null))) && (
            <Link
              href={mapsUrl || (selectedCoords ? `https://www.google.com/maps?q=${selectedCoords.lat},${selectedCoords.lng}` : buildMapsUrl(value))}
              target="_blank"
              rel="noopener noreferrer"
              fontSize="13px"
              fontWeight={600}
              color={GREEN}
              mt={2}
              display="inline-block"
              _hover={{ textDecoration: 'underline' }}
            >
              Open in Google Maps
            </Link>
          )}
        </Box>
      )}
    </Box>
  )
}
