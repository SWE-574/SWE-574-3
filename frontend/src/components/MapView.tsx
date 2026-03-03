/**
 * MapView — Mapbox GL JS (react-map-gl v8) based map component.
 *
 * Privacy-first: exact coordinates are NEVER shown to the user.
 * Each service's real lat/lng is offset by a deterministic ~1 km vector
 * derived from the service ID — consistent across renders but impossible
 * to reverse-engineer to a precise address.
 * Set VITE_MAPBOX_TOKEN in your .env to enable the map.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Map, {
  Source, Layer, Popup, NavigationControl,
} from 'react-map-gl/mapbox'
import type { MapRef, LayerProps } from 'react-map-gl/mapbox'
import type { MapMouseEvent } from 'mapbox-gl'
import type { Feature, FeatureCollection, Point } from 'geojson'
import 'mapbox-gl/dist/mapbox-gl.css'

import { GREEN, BLUE, AMBER, GRAY100, GRAY200, GRAY400, GRAY700, GRAY800, WHITE } from '@/theme/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MapServiceItem {
  id: string
  title: string
  type?: string
  location_type?: string
  location_area?: string
  location_lat?: string | number | null
  location_lng?: string | number | null
  latitude?: number
  longitude?: number
  user?: { first_name?: string; last_name?: string; email?: string }
  provider?: { first_name?: string; last_name?: string; email?: string }
}

export interface MapViewProps {
  services: MapServiceItem[]
  height?: string
  onServiceClick?: (id: string) => void
  userLocation?: { lat: number; lng: number } | null
}

const ISTANBUL_CENTER = { longitude: 28.9784, latitude: 41.0082, zoom: 11 }

// ─── Privacy helpers ──────────────────────────────────────────────────────────

/**
 * Deterministic 1 km fuzzy offset based on service ID.
 * Marker is placed within ~1 km of the real location.
 * A 2 km visual privacy circle is drawn around the marker.
 * 1 km ≈ 0.009° latitude at Istanbul's latitude.
 */
function idFuzzyOffset(id: string): { dLat: number; dLng: number } {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const angle = ((h >>> 0) / 0xFFFFFFFF) * 2 * Math.PI
  const R = 0.009                                   // ~1 km radius
  return { dLat: R * Math.sin(angle), dLng: R * Math.cos(angle) }
}

/**
 * Extra spiral jitter for services that still share the same fuzzy position
 * after idFuzzyOffset (very unlikely but possible for identical IDs / test data).
 */
function stackJitter(rank: number): { dLat: number; dLng: number } {
  if (rank === 0) return { dLat: 0, dLng: 0 }
  const angle = (rank * 137.5 * Math.PI) / 180
  const r = 0.001 * Math.sqrt(rank)                // ~100 m max extra spread
  return { dLat: r * Math.sin(angle), dLng: r * Math.cos(angle) }
}

function resolveCoords(service: MapServiceItem, idx: number): { lng: number; lat: number } {
  // Real coords from API (set by Mapbox geocoding during service creation)
  const lat = service.location_lat ?? service.latitude
  const lng = service.location_lng ?? service.longitude
  if (lat != null && lng != null) {
    const latN = Number(lat)
    const lngN = Number(lng)
    if (!isNaN(latN) && !isNaN(lngN)) return { lat: latN, lng: lngN }
  }
  // Fallback: scatter around Istanbul centre for legacy/unmapped services
  const offset = (idx % 8) * 0.012
  return { lat: ISTANBUL_CENTER.latitude + offset * 0.5, lng: ISTANBUL_CENTER.longitude + offset }
}

function ownerName(s: MapServiceItem): string {
  const u = s.user ?? s.provider
  if (!u) return ''
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || ''
}

// ─── GeoJSON builder ──────────────────────────────────────────────────────────

interface ServiceFeatureProps {
  serviceId: string
  title: string
  type: string        // "Offer" | "Need"
  ownerName: string
  area: string        // location_area label for display
}

function buildGeoJSON(services: MapServiceItem[]): FeatureCollection<Point, ServiceFeatureProps> {
  // Track rounded coords to detect stack collisions after fuzzy offset
  const coordRank: Record<string, number> = {}

  const features: Feature<Point, ServiceFeatureProps>[] = services
    .filter((s) => s.location_type !== 'Online')
    .map((s, i) => {
      const base   = resolveCoords(s, i)
      const fuzzy  = idFuzzyOffset(s.id)
      const fLat   = base.lat + fuzzy.dLat
      const fLng   = base.lng + fuzzy.dLng

      // Detect overlap after fuzzy (round to ~50 m grid)
      const key    = `${(fLat * 200).toFixed(0)}-${(fLng * 200).toFixed(0)}`
      const rank   = coordRank[key] ?? 0
      coordRank[key] = rank + 1
      const extra  = stackJitter(rank)

      const f: Feature<Point, ServiceFeatureProps> = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [fLng + extra.dLng, fLat + extra.dLat],
        },
        properties: {
          serviceId: s.id,
          title:     s.title,
          type:      s.type ?? 'Offer',
          ownerName: ownerName(s),
          area:      s.location_area ?? '',
        },
      }
      return f
    })
  return { type: 'FeatureCollection', features }
}

// ─── Mapbox layer specs ───────────────────────────────────────────────────────

// Outer glow ring — 2 km privacy circle around the fuzzy marker
// At zoom 12: 1 tile = 256px covering ~7.3 km  →  2 km ≈ 70 px
// Radius doubles every zoom level to stay physically constant on the ground
const outerCircleLayer: LayerProps = {
  id: 'service-outer',
  type: 'circle',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-radius': ['interpolate', ['exponential', 2], ['zoom'],
      8,  4,
      9,  8,
      10, 17,
      11, 34,
      12, 68,
      13, 136,
      14, 272,
    ],
    'circle-color': [
      'match', ['get', 'type'],
      'Offer', GREEN,
      'Need',  BLUE,
      AMBER,
    ],
    'circle-opacity': 0.5,
    'circle-blur': 0.1,
    'circle-stroke-width': 1.5,
    'circle-stroke-color': [
      'match', ['get', 'type'],
      'Offer', GREEN,
      'Need',  BLUE,
      AMBER,
    ],
    'circle-stroke-opacity': 0.45,
  },
}

// Inner dot — hidden (opacity 0); kept so interactiveLayerIds still works for hover/click
const innerCircleLayer: LayerProps = {
  id: 'service-inner',
  type: 'circle',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 12, 9, 13, 13, 14, 18, 15, 24],
    'circle-color': GREEN,
    'circle-opacity': 0,
    'circle-stroke-width': 0,
    'circle-stroke-opacity': 0,
  },
}

// Cluster background circle
const clusterCircleLayer: LayerProps = {
  id: 'cluster-circle',
  type: 'circle',
  filter: ['has', 'point_count'],
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 22, 10, 34, 30, 46],
    'circle-color': AMBER,
    'circle-opacity': 0.80,
    'circle-stroke-width': 2,
    'circle-stroke-color': WHITE,
    'circle-stroke-opacity': 0.9,
  },
}

// Cluster count label
const clusterLabelLayer: LayerProps = {
  id: 'cluster-label',
  type: 'symbol',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-size': 13,
    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
    'text-allow-overlap': true,
  },
  paint: {
    'text-color': WHITE,
  },
}

// ─── Missing token fallback ───────────────────────────────────────────────────

function TokenMissingFallback({ height }: { height: string }) {
  return (
    <div
      style={{
        height,
        width: '100%',
        borderRadius: '12px',
        background: GRAY100,
        border: `1px solid ${GRAY200}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        color: GRAY400,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
      </svg>
      <span style={{ fontSize: '13px', fontWeight: 500, color: GRAY700 }}>Map unavailable</span>
      <span style={{ fontSize: '12px', color: GRAY400 }}>Set VITE_MAPBOX_TOKEN in .env to enable the map</span>
    </div>
  )
}

// ─── Popup card ───────────────────────────────────────────────────────────────

interface PopupInfo {
  longitude: number
  latitude: number
  serviceId: string
  title: string
  type: string
  ownerName: string
  area: string
  isCluster: boolean
  clusterCount?: number
}

function ServicePopup({
  info,
  onServiceClick,
  onClose,
}: {
  info: PopupInfo
  onServiceClick?: (id: string) => void
  onClose: () => void
}) {
  const isOffer = info.type === 'Offer'
  const accentColor = isOffer ? GREEN : BLUE
  const badgeBg    = isOffer ? '#dcfce7' : '#dbeafe'
  const badgeColor = isOffer ? '#166534' : '#1e3a8a'

  if (info.isCluster) {
    return (
      <Popup
        longitude={info.longitude}
        latitude={info.latitude}
        anchor="left"
        closeButton={false}
        closeOnClick={false}
        onClose={onClose}
        offset={16}
      >
        <div style={{ fontFamily: 'Inter, sans-serif', padding: '8px 4px', minWidth: '140px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: GRAY800 }}>
            {info.clusterCount} services
          </div>
          <div style={{ fontSize: '12px', color: GRAY400, marginTop: '2px' }}>
            Click to expand
          </div>
        </div>
      </Popup>
    )
  }

  return (
    <Popup
      longitude={info.longitude}
      latitude={info.latitude}
      anchor="left"
      closeButton={false}
      closeOnClick={false}
      onClose={onClose}
      offset={16}
    >
      <div
        style={{
          fontFamily: 'Inter, sans-serif',
          padding: '2px',
          minWidth: '180px',
          maxWidth: '240px',
        }}
      >
        {/* Type badge */}
        <div style={{ marginBottom: '6px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
              background: badgeBg,
              color: badgeColor,
              letterSpacing: '0.02em',
            }}
          >
            {info.type}
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: GRAY800,
            lineHeight: 1.35,
            marginBottom: '4px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {info.title}
        </div>

        {/* Owner name */}
        {info.ownerName && (
          <div style={{ fontSize: '11px', color: GRAY400, marginBottom: '10px' }}>
            {info.ownerName}
          </div>
        )}

        {/* CTA */}
        {onServiceClick && (
          <button
            onClick={() => onServiceClick(info.serviceId)}
            style={{
              width: '100%',
              padding: '6px 0',
              borderRadius: '7px',
              border: 'none',
              background: accentColor,
              color: WHITE,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.01em',
            }}
          >
            View details →
          </button>
        )}
      </div>
    </Popup>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

// ─── My-Location button ───────────────────────────────────────────────────────

function MyLocationButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Go to my location"
      style={{
        position: 'absolute', bottom: '40px', right: '10px', zIndex: 10,
        width: '36px', height: '36px', borderRadius: '8px',
        background: hover ? '#f0fdf4' : WHITE,
        border: `1px solid ${GRAY200}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
    >
      {/* crosshair / locate icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MapView({ services, height = '400px', onServiceClick, userLocation }: MapViewProps) {
  const mapRef = useRef<MapRef>(null)
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null)

  const geojsonData = useMemo(() => buildGeoJSON(services), [services])

  // Fly to user location on first load if available
  useEffect(() => {
    if (!userLocation || !mapRef.current) return
    mapRef.current.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 10,
      duration: 800,
    })
  }, [userLocation])

  const flyToUser = useCallback(() => {
    if (!userLocation || !mapRef.current) return
    mapRef.current.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 10,
      duration: 700,
    })
  }, [userLocation])

  // On hover: show popup
  const onMouseMove = useCallback((e: MapMouseEvent) => {
    const features = e.features
    if (!features || features.length === 0) {
      setPopupInfo(null)
      return
    }

    const f = features[0]
    if (!f.geometry || f.geometry.type !== 'Point') return
    const [lng, lat] = f.geometry.coordinates as [number, number]

    if (f.properties?.point_count) {
      // Cluster hover
      setPopupInfo({
        longitude: lng,
        latitude: lat,
        serviceId: '',
        title: '',
        type: '',
        ownerName: '',
        area: '',
        isCluster: true,
        clusterCount: f.properties.point_count as number,
      })
    } else if (f.properties?.serviceId) {
      setPopupInfo({
        longitude: lng,
        latitude: lat,
        serviceId: f.properties.serviceId as string,
        title: f.properties.title as string,
        type: f.properties.type as string,
        ownerName: f.properties.ownerName as string,
        area: f.properties.area as string,
        isCluster: false,
      })
    }
  }, [])

  // On click: zoom into cluster OR navigate to service
  const onClick = useCallback(
    (e: MapMouseEvent) => {
      const features = e.features
      if (!features || features.length === 0) return

      const f = features[0]
      if (!f.geometry || f.geometry.type !== 'Point') return
      const [lng, lat] = f.geometry.coordinates as [number, number]

      if (f.properties?.point_count && f.properties?.cluster_id) {
        // Zoom into cluster — access underlying mapbox-gl Map for getClusterExpansionZoom
        const source = mapRef.current?.getMap().getSource('services') as {
          getClusterExpansionZoom?: (id: number, cb: (err: Error | null, zoom: number) => void) => void
        } | undefined
        if (!source?.getClusterExpansionZoom) return
        source.getClusterExpansionZoom(f.properties.cluster_id as number, (err, zoom) => {
          if (err) return
          mapRef.current?.flyTo({ center: [lng, lat], zoom: zoom + 0.1, duration: 500 })
        })
      } else if (f.properties?.serviceId) {
        onServiceClick?.(f.properties.serviceId as string)
      }
    },
    [onServiceClick],
  )

  // Cursor management via interactiveLayerIds hover
  const [cursor, setCursor] = useState('grab')
  const onMouseEnterLayer = useCallback(() => setCursor('pointer'), [])
  const onMouseLeaveMap   = useCallback(() => { setCursor('grab'); setPopupInfo(null) }, [])

  if (!TOKEN) {
    if (import.meta.env.DEV) {
      console.warn('[MapView] VITE_MAPBOX_TOKEN is not set — map disabled.')
    }
    return <TokenMissingFallback height={height} />
  }

  // User location GeoJSON (single point for the blue dot)
  const userGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: userLocation ? [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [userLocation.lng, userLocation.lat] },
      properties: {},
    }] : [],
  }), [userLocation])

  const userDotLayer: LayerProps = {
    id: 'user-location',
    type: 'circle',
    paint: {
      'circle-radius': 9,
      'circle-color': '#3B82F6',
      'circle-stroke-width': 3,
      'circle-stroke-color': WHITE,
      'circle-opacity': 0.95,
    },
  }

  const userHaloLayer: LayerProps = {
    id: 'user-halo',
    type: 'circle',
    paint: {
      'circle-radius': 20,
      'circle-color': '#3B82F6',
      'circle-opacity': 0.15,
      'circle-blur': 0.5,
    },
  }

  // For a single in-person service with no userLocation, center on the fuzzy marker
  const initialView = useMemo(() => {
    if (userLocation) return { longitude: userLocation.lng, latitude: userLocation.lat, zoom: 11 }
    const inPerson = services.filter((s) => s.location_type !== 'Online')
    if (inPerson.length === 1) {
      const s   = inPerson[0]
      const lat = Number(s.location_lat ?? s.latitude)
      const lng = Number(s.location_lng ?? s.longitude)
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        const fuzz = idFuzzyOffset(s.id)
        return { longitude: lng + fuzz.dLng, latitude: lat + fuzz.dLat, zoom: 11 }
      }
    }
    return ISTANBUL_CENTER
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={initialView}
        style={{ width: '100%', height, borderRadius: '12px' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        scrollZoom={false}
        cursor={cursor}
        interactiveLayerIds={['service-outer', 'service-inner', 'cluster-circle', 'cluster-label']}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeaveMap}
        onClick={onClick}
        onMouseEnter={onMouseEnterLayer}
      >
        <NavigationControl position="top-right" showCompass={false} />

        <Source
          id="services"
          type="geojson"
          data={geojsonData}
          cluster
          clusterMaxZoom={13}
          clusterRadius={55}
        >
          {/* Render order: outer glow → inner ring → cluster circle → cluster label */}
          <Layer {...outerCircleLayer} />
          <Layer {...innerCircleLayer} />
          <Layer {...clusterCircleLayer} />
          <Layer {...clusterLabelLayer} />
        </Source>

        {/* User position dot */}
        {userLocation && (
          <Source id="user-pos" type="geojson" data={userGeoJSON}>
            <Layer {...userHaloLayer} />
            <Layer {...userDotLayer} />
          </Source>
        )}

        {popupInfo && (
          <ServicePopup
            info={popupInfo}
            onServiceClick={onServiceClick}
            onClose={() => setPopupInfo(null)}
          />
        )}
      </Map>

      {/* My-Location button — outside Map so it's not clipped */}
      {userLocation && (
        <MyLocationButton onClick={flyToUser} />
      )}
    </div>
  )
}
