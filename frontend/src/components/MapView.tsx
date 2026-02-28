import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// Fix default Leaflet marker icons in Vite/webpack
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const offerIcon = new L.Icon({
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const needIcon = new L.Icon({
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Istanbul default center
const ISTANBUL_CENTER: [number, number] = [41.0082, 28.9784]

interface MapServiceItem {
  id: string
  title: string
  type?: string
  location_type?: string
  location_lat?: string | number | null
  location_lng?: string | number | null
  latitude?: number
  longitude?: number
  user?: { first_name?: string; last_name?: string; email?: string }
  provider?: { first_name?: string; last_name?: string; email?: string }
}

interface MapViewProps {
  services: MapServiceItem[]
  height?: string
  onServiceClick?: (id: string) => void
}

function getCoords(
  s: MapServiceItem,
): [number, number] | null {
  const lat = s.location_lat ?? s.latitude
  const lng = s.location_lng ?? s.longitude
  if (lat == null || lng == null) return null
  const latNum = typeof lat === 'string' ? parseFloat(lat) : lat
  const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng
  if (isNaN(latNum) || isNaN(lngNum)) return null
  return [latNum, lngNum]
}

// Dummy component to invalidate map size after mount (handles hidden container issues)
function MapResizer() {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
  }, [map])
  return null
}

export function MapView({ services, height = '400px', onServiceClick }: MapViewProps) {
  const locatedServices = services.filter((s) => getCoords(s) !== null)

  return (
    <MapContainer
      center={ISTANBUL_CENTER}
      zoom={11}
      style={{ height, width: '100%', borderRadius: '12px' }}
      scrollWheelZoom={false}
    >
      <MapResizer />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locatedServices.map((service) => {
        const coords = getCoords(service)!
        const icon = service.type === 'Offer' ? offerIcon : needIcon
        const owner = service.user ?? service.provider
        const ownerName = owner
          ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() || owner.email
          : ''
        return (
          <Marker key={service.id} position={coords} icon={icon}>
            <Popup>
              <div style={{ minWidth: '140px' }}>
                <strong style={{ fontSize: '13px' }}>{service.title}</strong>
                {ownerName && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    {ownerName}
                  </div>
                )}
                <div
                  style={{
                    display: 'inline-block',
                    marginTop: '6px',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    background: service.type === 'Offer' ? '#dcfce7' : '#dbeafe',
                    color: service.type === 'Offer' ? '#15803d' : '#1d4ed8',
                  }}
                >
                  {service.type === 'Need' ? 'Want' : service.type}
                </div>
                {onServiceClick && (
                  <div
                    onClick={() => onServiceClick(service.id)}
                    style={{
                      marginTop: '8px',
                      fontSize: '12px',
                      color: '#f97316',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    View details →
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
