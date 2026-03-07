import { useState, useEffect, useRef, useCallback } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import {
  Box, Flex, Grid, Input, Spinner, Stack, Text, Textarea,
} from '@chakra-ui/react'
import { FiX, FiImage, FiClock, FiMapPin, FiCalendar, FiTag, FiSearch, FiCheckCircle, FiNavigation, FiStar } from 'react-icons/fi'
import { toast } from 'sonner'
import { serviceAPI } from '@/services/serviceAPI'
import WikidataTagAutocomplete from './WikidataTagAutocomplete'
import type { Service, ServiceMedia, Tag } from '@/types'

import {
  GREEN, GREEN_LT,
  BLUE, BLUE_LT,
  AMBER, AMBER_LT,
  RED,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const schema = z.object({
  title:            z.string().min(3, 'Title must be at least 3 characters').max(200),
  description:      z.string().min(10, 'Description must be at least 10 characters').max(5000),
  duration:         z.coerce.number().positive('Duration must be greater than 0').max(999),
  location_type:    z.enum(['In-Person', 'Online']),
  max_participants: z.coerce.number().int().positive('Must be at least 1').max(100),
  schedule_type:    z.enum(['One-Time', 'Recurrent']),
  schedule_details: z.string().max(500).optional(),
})

type FormValues = z.infer<typeof schema>

interface EditableMediaItem {
  key: string
  preview: string
  source: 'existing' | 'new'
  mediaId?: string
  file?: File
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function imageMediaOnly(media: ServiceMedia[] | undefined): ServiceMedia[] {
  return (media ?? []).filter((item) => item.media_type === 'image')
}

// ─── Mapbox geocoding types ───────────────────────────────────────────────────

interface GeoContext {
  id: string    // e.g. "place.12345", "district.678", "region.90"
  text: string
}

interface GeoFeature {
  id: string
  text: string
  place_name: string
  place_type?: string[]
  center: [number, number]  // [lng, lat]
  context?: GeoContext[]
}

/**
 * Extract the district (ilçe) name from a Mapbox geocoding feature.
 * Mapbox Turkey hierarchy: neighborhood → locality → place (ilçe) → district (il) → region → country
 */
function extractDistrict(f: GeoFeature): string {
  const ctx = f.context ?? []
  const place    = ctx.find(c => c.id.startsWith('place.'))
  if (place) return place.text
  const locality = ctx.find(c => c.id.startsWith('locality.'))
  if (locality) return locality.text
  if (f.place_type?.includes('place')) return f.text
  return f.text
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

// ─── Section label ────────────────────────────────────────────────────────────

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Flex align="center" gap={2} mb={4}>
        <Box color={GRAY400}>{icon}</Box>
        <Text fontSize="12px" fontWeight={700} color={GRAY500}
          style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          {label}
        </Text>
      </Flex>
      {children}
    </Box>
  )
}

// ─── Form label ───────────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Text fontSize="13px" fontWeight={600} color={GRAY700} mb="6px">
      {children}
      {required && <Text as="span" color={RED} ml="3px">*</Text>}
    </Text>
  )
}

// ─── Error text ───────────────────────────────────────────────────────────────

function ErrTxt({ msg }: { msg?: string }) {
  if (!msg) return null
  return <Text fontSize="11px" color={RED} mt="4px">{msg}</Text>
}

// ─── Styled input wrapper ─────────────────────────────────────────────────────

const inputStyle = {
  borderRadius: '10px',
  border: `1px solid ${GRAY200}`,
  fontSize: '14px',
  color: GRAY800,
  background: WHITE,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

// ─── Segmented control ────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  value, onChange, options, accent,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  accent: string
}) {
  return (
    <Flex bg={GRAY100} p="3px" borderRadius="10px" gap="2px">
      {options.map((opt) => (
        <Box
          key={opt.value}
          as="button"
          flex={1} py="8px"
          borderRadius="8px"
          fontSize="13px"
          fontWeight={value === opt.value ? 700 : 500}
          bg={value === opt.value ? WHITE : 'transparent'}
          color={value === opt.value ? GRAY800 : GRAY500}
          boxShadow={value === opt.value ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'}
          cursor="pointer"
          transition="all 0.12s"
          onClick={(e) => { e.preventDefault(); onChange(opt.value) }}
          style={{
            border: 'none',
            outline: value === opt.value ? `2px solid ${accent}20` : 'none',
          }}
        >
          {opt.label}
        </Box>
      ))}
    </Flex>
  )
}

// ─── "Use my location" button ────────────────────────────────────────────────

function UseMyLocationButton({
  accent,
  onLocated,
}: {
  accent: string
  onLocated: (v: LocationValue) => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  const handleClick = () => {
    if (!navigator.geolocation) { setErr('Geolocation not supported'); return }
    if (!MAPBOX_TOKEN) { setErr('Mapbox token not set'); return }
    setLoading(true); setErr(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=address,neighborhood,locality,place&language=tr&limit=1`
          const res  = await fetch(url)
          const data = await res.json() as { features?: GeoFeature[] }
          const f    = data.features?.[0]
          const label = f ? extractDistrict(f) : `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          onLocated({ label, lat, lng })
        } catch {
          onLocated({ label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng })
        } finally { setLoading(false) }
      },
      () => { setErr('Could not get your location'); setLoading(false) },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <Box>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: '12px', fontWeight: 600, color: accent,
          background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.65 : 1, padding: 0,
        }}
      >
        {loading
          ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: `2px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Locating…</>
          : <><FiNavigation size={12} /> Use my location</>
        }
      </button>
      {err && <Text fontSize="11px" color={RED} mt="2px">{err}</Text>}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </Box>
  )
}

// ─── Address search (Mapbox Geocoding) ───────────────────────────────────────

interface LocationValue {
  label: string
  lat: number
  lng: number
}

function LocationSearch({
  accent,
  value,
  onChange,
  error,
}: {
  accent: string
  value: LocationValue | null
  onChange: (v: LocationValue | null) => void
  error?: string
}) {
  const [query, setQuery]       = useState(value?.label ?? '')
  const [results, setResults]   = useState<GeoFeature[]>([])
  const [loading, setLoading]   = useState(false)
  const [showDrop, setShowDrop] = useState(false)
  const abortRef                = useRef<AbortController | null>(null)

  // Sync internal query when value is set from outside (e.g. "Use my location")
  useEffect(() => {
    if (value?.label && value.label !== query) {
      setQuery(value.label)
      setResults([])
      setShowDrop(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.label])

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) { setResults([]); return }
    if (!MAPBOX_TOKEN) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    try {
      const url = [
        'https://api.mapbox.com/geocoding/v5/mapbox.places/',
        encodeURIComponent(q),
        '.json?access_token=', MAPBOX_TOKEN,
        '&country=TR&types=address,neighborhood,locality,place,district',
        '&proximity=28.9784,41.0082',  // bias toward Istanbul
        '&language=tr&limit=6',
      ].join('')
      const res  = await fetch(url, { signal: abortRef.current.signal })
      const data = await res.json() as { features?: GeoFeature[] }
      setResults(data.features ?? [])
    } catch { /* aborted */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (value?.label === query) return   // already confirmed selection
    const t = setTimeout(() => search(query), 350)
    return () => clearTimeout(t)
  }, [query, search, value?.label])

  const handleSelect = (f: GeoFeature) => {
    const [lng, lat] = f.center
    const label = extractDistrict(f)   // store & display only the district name
    setQuery(label)
    setShowDrop(false)
    setResults([])
    onChange({ label, lat, lng })
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    onChange(null)
  }

  const confirmed = value !== null && value.label === query

  return (
    <Box>
      <Box position="relative">
        <Flex
          align="center" gap={2}
          bg={WHITE}
          border={`1px solid ${error ? RED : confirmed ? accent : GRAY200}`}
          borderRadius="10px" px={3} overflow="hidden"
          style={{ transition: 'border-color 0.15s, box-shadow 0.15s' }}
          _focusWithin={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
        >
          {loading
            ? <Spinner size="xs" color="gray.400" flexShrink={0} />
            : confirmed
              ? <FiCheckCircle size={13} color={accent} style={{ flexShrink: 0 }} />
              : <FiSearch size={13} color={GRAY400} style={{ flexShrink: 0 }} />
          }
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowDrop(true); if (value) onChange(null) }}
            onFocus={() => { if (results.length > 0) setShowDrop(true) }}
            onBlur={() => setTimeout(() => setShowDrop(false), 160)}
            placeholder="Search address — e.g. Bağdat Caddesi, Kadıköy"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: '14px', color: GRAY800, padding: '10px 0',
            }}
          />
          {query && (
            <Box
              as="button"
              onClick={(e) => { e.preventDefault(); handleClear() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: GRAY400 }}
            >
              <FiX size={13} />
            </Box>
          )}
        </Flex>

        {showDrop && (results.length > 0 || loading) && (
          <Box
            position="absolute" zIndex={30} top="calc(100% + 6px)" left={0} right={0}
            bg={WHITE} border={`1px solid ${GRAY200}`} borderRadius="12px"
            boxShadow="0 8px 24px rgba(0,0,0,0.12)" maxH="256px" overflowY="auto"
          >
            {loading && <Flex justify="center" p={3}><Spinner size="sm" /></Flex>}
            {!loading && results.map((f) => (
              <Box
                key={f.id} px={4} py="10px"
                cursor="pointer"
                onMouseDown={() => handleSelect(f)}
                _hover={{ bg: GRAY50 }}
              >
                <Text fontSize="13px" fontWeight={600} color={GRAY800}>{f.text}</Text>
                <Text fontSize="11px" color={GRAY400} mt="1px">{f.place_name}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {confirmed && (
        <Text fontSize="11px" color={accent} mt="5px" fontWeight={500}>
          ✓ Location set — exact address will be hidden on the map (2 km privacy zone)
        </Text>
      )}
      {error && <Text fontSize="11px" color={RED} mt="4px">{error}</Text>}
    </Box>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ServiceFormProps {
  type: 'Offer' | 'Need' | 'Event'
  mode?: 'create' | 'edit'
  serviceId?: string
  initialService?: Service
}

export default function ServiceForm({
  type,
  mode = 'create',
  serviceId,
  initialService,
}: ServiceFormProps) {
  const navigate = useNavigate()
  const accent   = type === 'Event' ? AMBER : type === 'Offer' ? GREEN : BLUE
  const accentLt = type === 'Event' ? AMBER_LT : type === 'Offer' ? GREEN_LT : BLUE_LT
  const isEditMode = mode === 'edit' && !!serviceId

  // Tags
  const [selectedTags, setSelectedTags]     = useState<Tag[]>([])

  // Location (set by Mapbox geocoding)
  const [locationValue, setLocationValue]   = useState<LocationValue | null>(null)
  const [locationError, setLocationError]   = useState<string | undefined>()

  // Media
  const [mediaFiles, setMediaFiles]         = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews]   = useState<string[]>([])
  const [primaryMediaIdx, setPrimaryMediaIdx] = useState(0)
  const [editableMediaItems, setEditableMediaItems] = useState<EditableMediaItem[]>([])
  const [unmanagedMediaIds, setUnmanagedMediaIds] = useState<string[]>([])
  const [mediaDirty, setMediaDirty] = useState(false)
  const [submitting, setSubmitting]         = useState(false)

  // Event-specific date/time
  const [eventDate, setEventDate]           = useState('')
  const [eventTime, setEventTime]           = useState('')
  const [eventDateTimeError, setEventDateTimeError] = useState<string | undefined>()

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { location_type: 'In-Person', schedule_type: 'One-Time', max_participants: 1 },
  })

  const locType   = watch('location_type')
  const schedType = watch('schedule_type')

  const addTag = (tag: Tag) => {
    setSelectedTags((prev) => {
      const exists = prev.some((existingTag) => existingTag.id === tag.id)
      return exists ? prev : [...prev, tag]
    })
  }

  useEffect(() => {
    if (!initialService) return

    reset({
      title: initialService.title,
      description: initialService.description,
      duration: Number(initialService.duration),
      location_type: initialService.location_type,
      max_participants: initialService.max_participants,
      schedule_type: initialService.schedule_type,
      schedule_details: initialService.schedule_details ?? '',
    })

    setSelectedTags(initialService.tags ?? [])

    if (initialService.location_type === 'In-Person' && initialService.location_area) {
      const lat = initialService.location_lat == null ? null : Number(initialService.location_lat)
      const lng = initialService.location_lng == null ? null : Number(initialService.location_lng)
      if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
        setLocationValue({
          label: initialService.location_area,
          lat,
          lng,
        })
      }
    }

    if (initialService.type === 'Event' && initialService.scheduled_time) {
      const scheduledDate = new Date(initialService.scheduled_time)
      if (!Number.isNaN(scheduledDate.getTime())) {
        const year = scheduledDate.getFullYear()
        const month = String(scheduledDate.getMonth() + 1).padStart(2, '0')
        const day = String(scheduledDate.getDate()).padStart(2, '0')
        const hours = String(scheduledDate.getHours()).padStart(2, '0')
        const minutes = String(scheduledDate.getMinutes()).padStart(2, '0')
        setEventDate(`${year}-${month}-${day}`)
        setEventTime(`${hours}:${minutes}`)
      }
    }

    if (isEditMode) {
      setEditableMediaItems(
        imageMediaOnly(initialService.media).map((item) => ({
          key: `existing-${item.id}`,
          preview: item.file_url,
          source: 'existing' as const,
          mediaId: item.id,
        })),
      )
      setUnmanagedMediaIds(
        (initialService.media ?? [])
          .filter((item) => item.media_type !== 'image')
          .map((item) => item.id),
      )
      setMediaDirty(false)
    }
  }, [initialService, isEditMode, reset])

  // ── Media ────────────────────────────────────────────────────────────────

  const handleMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 5 - mediaFiles.length)
    if (!files.length) return
    setMediaFiles((p) => [...p, ...files])
    files.forEach((f) => {
      const r = new FileReader()
      r.onload = (ev) => setMediaPreviews((p) => [...p, ev.target?.result as string])
      r.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const removeMedia = (i: number) => {
    setMediaFiles((p) => p.filter((_, j) => j !== i))
    setMediaPreviews((p) => p.filter((_, j) => j !== i))
    setPrimaryMediaIdx((prev) => {
      if (prev === i) return 0
      if (prev > i) return prev - 1
      return prev
    })
  }

  const setAsPrimary = (i: number) => {
    if (i === primaryMediaIdx) return
    // Move selected to front
    setMediaFiles((p) => {
      const next = [...p]
      const [item] = next.splice(i, 1)
      next.unshift(item)
      return next
    })
    setMediaPreviews((p) => {
      const next = [...p]
      const [item] = next.splice(i, 1)
      next.unshift(item)
      return next
    })
    setPrimaryMediaIdx(0)
  }

  const handleEditMedia = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const remainingSlots = 5 - editableMediaItems.length
    const incoming = Array.from(e.target.files ?? [])
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, remainingSlots)

    if (!incoming.length) {
      e.target.value = ''
      return
    }

    if (incoming.length < (e.target.files?.length ?? 0)) {
      toast.error('You can keep up to 5 photos per service.')
    }

    try {
      const nextItems = await Promise.all(
        incoming.map(async (file) => ({
          key: `new-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          preview: await readFileAsDataUrl(file),
          source: 'new' as const,
          file,
        })),
      )
      setEditableMediaItems((prev) => [...prev, ...nextItems])
      setMediaDirty(true)
    } catch {
      toast.error('Could not load the selected photo.')
    } finally {
      e.target.value = ''
    }
  }, [editableMediaItems.length])

  const removeEditableMedia = useCallback((key: string) => {
    setEditableMediaItems((prev) => prev.filter((item) => item.key !== key))
    setMediaDirty(true)
  }, [])

  const setEditablePrimary = useCallback((index: number) => {
    setEditableMediaItems((prev) => {
      if (index <= 0 || index >= prev.length) return prev
      const next = [...prev]
      const [selected] = next.splice(index, 1)
      next.unshift(selected)
      return next
    })
    setMediaDirty(true)
  }, [])

  // ── Submit ───────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    // Validate location for In-Person
    if (values.location_type === 'In-Person') {
      if (!locationValue) {
        setLocationError('Please search and select a location')
        return
      }
    }
    setLocationError(undefined)

    // Validate scheduled_time for Events
    if (type === 'Event') {
      if (!eventDate || !eventTime) {
        setEventDateTimeError('Please select both a date and time for the event')
        return
      }
      const scheduledMs = new Date(`${eventDate}T${eventTime}:00`).getTime()
      if (scheduledMs <= Date.now()) {
        setEventDateTimeError('Event date/time must be in the future')
        return
      }
      setEventDateTimeError(undefined)
    }

    setSubmitting(true)
    try {
      const tagIds: string[] = []
      const tagNames: string[] = []
      const wikidataLabelMap: Record<string, string> = {}

      selectedTags.forEach((tag) => {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tag.id)
        const isWikidataQid = /^Q\d+$/i.test(tag.id)

        if (isUuid || isWikidataQid) {
          tagIds.push(tag.id)
          if (isWikidataQid) {
            const cleanedName = tag.name.trim()
            if (cleanedName && cleanedName.toUpperCase() !== tag.id.toUpperCase()) {
              wikidataLabelMap[tag.id.toUpperCase()] = cleanedName
            }
          }
          return
        }

        const cleanedName = tag.name.trim()
        if (cleanedName) tagNames.push(cleanedName)
      })

      if (isEditMode && serviceId) {
        const fd = new FormData()
        fd.append('title', values.title)
        fd.append('description', values.description)
        fd.append('duration', String(values.duration))
        fd.append('location_type', values.location_type)
        fd.append('max_participants', type === 'Need' ? '1' : String(values.max_participants))
        fd.append('schedule_type', type === 'Event' ? 'One-Time' : values.schedule_type)
        fd.append('schedule_details', values.schedule_details ?? '')
        if (values.location_type === 'In-Person' && locationValue) {
          fd.append('location_area', locationValue.label.slice(0, 100))
          fd.append('location_lat', locationValue.lat.toFixed(6))
          fd.append('location_lng', locationValue.lng.toFixed(6))
        } else {
          fd.append('location_area', '')
        }
        if (type === 'Event' && eventDate && eventTime) {
          fd.append('scheduled_time', new Date(`${eventDate}T${eventTime}:00`).toISOString())
        }
        tagIds.forEach((id) => fd.append('tag_ids', id))
        tagNames.forEach((name) => fd.append('tag_names', name))
        if (Object.keys(wikidataLabelMap).length > 0) {
          fd.append('wikidata_labels_json', JSON.stringify(wikidataLabelMap))
        }
        if (mediaDirty) {
          fd.append('replace_media', 'true')
          let newMediaIdx = 0
          editableMediaItems.forEach((item) => {
            if (item.source === 'existing' && item.mediaId) {
              fd.append('media_order', `existing:${item.mediaId}`)
              return
            }
            if (item.file) {
              fd.append('media_order', `new:${newMediaIdx}`)
              fd.append('media', item.file)
              newMediaIdx += 1
            }
          })
          unmanagedMediaIds.forEach((mediaId) => fd.append('media_order', `existing:${mediaId}`))
        }
        const updated = await serviceAPI.update(serviceId, fd)
        toast.success(`${type} updated successfully!`)
        navigate(`/service-detail/${updated.id}`)
      } else {
        const fd = new FormData()
        fd.append('title', values.title)
        fd.append('description', values.description)
        fd.append('type', type)
        fd.append('duration', String(values.duration))
        fd.append('location_type', values.location_type)
        if (values.location_type === 'In-Person' && locationValue) {
          // Truncate label to 100 chars (backend max_length) to avoid DRF validation errors
          fd.append('location_area', locationValue.label.slice(0, 100))
          // Round to 6 decimal places — backend DecimalField(max_digits=9, decimal_places=6)
          fd.append('location_lat',  locationValue.lat.toFixed(6))
          fd.append('location_lng',  locationValue.lng.toFixed(6))
        }
        fd.append('max_participants', type === 'Need' ? '1' : String(values.max_participants))
        fd.append('schedule_type', type === 'Event' ? 'One-Time' : values.schedule_type)
        if (values.schedule_details) fd.append('schedule_details', values.schedule_details)
        if (type === 'Event' && eventDate && eventTime) {
          // Send as UTC ISO string so the backend stores the correct absolute time
          // regardless of the server's TIME_ZONE setting.
          fd.append('scheduled_time', new Date(`${eventDate}T${eventTime}:00`).toISOString())
        }
        tagIds.forEach((id) => fd.append('tag_ids', id))
        tagNames.forEach((name) => fd.append('tag_names', name))
        if (Object.keys(wikidataLabelMap).length > 0) {
          fd.append('wikidata_labels_json', JSON.stringify(wikidataLabelMap))
        }
        // Send cover (primary) first so the backend stores it as display_order=0
        const orderedFiles = primaryMediaIdx === 0
          ? mediaFiles
          : [
              mediaFiles[primaryMediaIdx],
              ...mediaFiles.filter((_, i) => i !== primaryMediaIdx),
            ]
        orderedFiles.forEach((f) => fd.append('media', f))
        const created = await serviceAPI.create(fd)
        toast.success(`${type} posted successfully!`)
        navigate(`/service-detail/${created.id}`)
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: unknown } })?.response?.data
      let msg = 'Failed to post. Please try again.'
      if (data && typeof data === 'object') {
        if ('detail' in data && typeof (data as Record<string, unknown>).detail === 'string') {
          msg = (data as Record<string, string>).detail
        } else {
          // DRF returns field-level errors as { field: [msg, ...], ... }
          const firstError = Object.values(data as Record<string, unknown>)
            .flatMap((v) => (Array.isArray(v) ? v : [v]))
            .find((v) => typeof v === 'string')
          if (firstError) msg = String(firstError)
        }
      }
      toast.error(msg)
    } finally { setSubmitting(false) }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap={7}>

        {/* ── Basic Info ─────────────────────────────────────────────────── */}
        <Section icon={<FiTag size={14} />} label="Basic Info">
          <Stack gap={4}>
            <Box>
              <Label required>Title</Label>
              <Input
                placeholder={type === 'Event' ? 'e.g. Weekend hiking meetup' : type === 'Offer' ? 'e.g. Guitar lessons for beginners' : 'e.g. Need help moving furniture'}
                {...register('title')}
                style={inputStyle}
                _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
              />
              <ErrTxt msg={errors.title?.message} />
            </Box>

            <Box>
              <Label required>Description</Label>
              <Textarea
                placeholder={type === 'Event' ? 'Describe your event, what participants can expect…' : "Describe what you're offering or what you need in detail…"}
                rows={4}
                {...register('description')}
                style={{ ...inputStyle, resize: 'vertical' }}
                _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
              />
              <ErrTxt msg={errors.description?.message} />
            </Box>
          </Stack>
        </Section>

        <Box h="1px" bg={GRAY100} />

        {/* ── Time & Place ───────────────────────────────────────────────── */}
        <Section icon={<FiClock size={14} />} label="Time & Place">
          <Stack gap={4}>
            <Grid templateColumns={{ base: '1fr', sm: '1fr 1fr' }} gap={4}>
              <Box>
                <Label required>Duration (hours)</Label>
                <Input
                  type="number" min={0.5} step={0.5} placeholder="e.g. 1.5"
                  {...register('duration')}
                  style={inputStyle}
                  _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
                />
                <ErrTxt msg={errors.duration?.message} />
              </Box>
              {type !== 'Need' && (
              <Box>
                <Label required>Max participants</Label>
                <Input
                  type="number" min={1} max={100} placeholder="1"
                  {...register('max_participants')}
                  style={inputStyle}
                  _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
                />
                <ErrTxt msg={errors.max_participants?.message} />
              </Box>
              )}
            </Grid>

            <Box>
              <Label required>Location</Label>
              <Controller
                name="location_type"
                control={control}
                render={({ field }) => (
                  <SegmentedControl
                    value={field.value}
                    onChange={field.onChange}
                    options={[{ value: 'In-Person', label: 'In-Person' }, { value: 'Online', label: 'Online' }]}
                    accent={accent}
                  />
                )}
              />
            </Box>

            {locType === 'In-Person' && (
              <Box>
                <Flex align="center" justify="space-between" mb="6px">
                  <Label required>
                    <FiMapPin size={12} style={{ display: 'inline', marginRight: 5 }} />
                    Address
                  </Label>
                  <UseMyLocationButton accent={accent} onLocated={(v) => { setLocationValue(v); setLocationError(undefined) }} />
                </Flex>
                <LocationSearch
                  accent={accent}
                  value={locationValue}
                  onChange={(v) => { setLocationValue(v); if (v) setLocationError(undefined) }}
                  error={locationError}
                />
              </Box>
            )}

            {type === 'Event' ? (
              <Box>
                <Label required>
                  <FiCalendar size={12} style={{ display: 'inline', marginRight: 5 }} />
                  Event Date & Time
                </Label>
                <Flex gap={3}>
                  <Box flex={1}>
                    <input
                      type="date"
                      value={eventDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => { setEventDate(e.target.value); setEventDateTimeError(undefined) }}
                      style={{ ...inputStyle, width: '100%', padding: '10px 12px' }}
                    />
                  </Box>
                  <Box flex={1}>
                    <input
                      type="time"
                      value={eventTime}
                      onChange={(e) => { setEventTime(e.target.value); setEventDateTimeError(undefined) }}
                      style={{ ...inputStyle, width: '100%', padding: '10px 12px' }}
                    />
                  </Box>
                </Flex>
                {eventDateTimeError && <ErrTxt msg={eventDateTimeError} />}
                <Text fontSize="11px" color={GRAY400} mt="5px">
                  Participants can join up until the event starts. 24 hours before the event, check-in opens and self-cancellation is disabled.
                </Text>
              </Box>
            ) : (
              <>
                <Box>
                  <Label required>
                    <FiCalendar size={12} style={{ display: 'inline', marginRight: 5 }} />
                    Schedule
                  </Label>
                  <Controller
                    name="schedule_type"
                    control={control}
                    render={({ field }) => (
                      <SegmentedControl
                        value={field.value}
                        onChange={field.onChange}
                        options={[{ value: 'One-Time', label: 'One-Time' }, { value: 'Recurrent', label: 'Recurring' }]}
                        accent={accent}
                      />
                    )}
                  />
                </Box>

                {schedType === 'Recurrent' && (
                  <Box>
                    <Label>Schedule details</Label>
                    <Input
                      placeholder="e.g. Every Saturday 10–11 AM"
                      {...register('schedule_details')}
                      style={inputStyle}
                      _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
                    />
                    <ErrTxt msg={errors.schedule_details?.message} />
                  </Box>
                )}

                {schedType === 'One-Time' && (
                  <Box>
                    <Label>Schedule details <Text as="span" fontSize="11px" color={GRAY400} fontWeight={400}>(optional)</Text></Label>
                    <Input
                      placeholder="e.g. This weekend, flexible timing"
                      {...register('schedule_details')}
                      style={inputStyle}
                      _focus={{ borderColor: accent, boxShadow: `0 0 0 2px ${accent}18` }}
                    />
                  </Box>
                )}
              </>
            )}
          </Stack>
        </Section>

        <Box h="1px" bg={GRAY100} />

        {/* ── Tags ───────────────────────────────────────────────────────── */}
        <Section icon={<FiTag size={14} />} label="Tags">
          <Box>
            {/* Selected tags */}
            {selectedTags.length > 0 && (
              <Flex gap={2} flexWrap="wrap" mb={3}>
                {selectedTags.map((tag) => (
                  <Flex
                    key={tag.id} align="center" gap="5px"
                    px="10px" py="5px" borderRadius="full"
                    bg={accentLt} fontSize="12px" fontWeight={600}
                    color={accent}
                    border={`1px solid ${accent}30`}
                  >
                    #{tag.name}
                    <Box
                      as="button"
                      onClick={(e) => { e.preventDefault(); setSelectedTags((p) => p.filter((t) => t.id !== tag.id)) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: accent }}
                    >
                      <FiX size={11} />
                    </Box>
                  </Flex>
                ))}
              </Flex>
            )}

            <WikidataTagAutocomplete
              selectedTags={selectedTags}
              onAddTag={addTag}
              disabled={selectedTags.length >= 10}
              accent={accent}
            />
            <Text fontSize="11px" color={GRAY400} mt="6px">
              Add up to 10 tags to help others find your {type.toLowerCase()}
            </Text>
          </Box>
        </Section>

        <Box h="1px" bg={GRAY100} />

        {/* ── Images ─────────────────────────────────────────────────────── */}
        {!isEditMode && (
        <Section icon={<FiImage size={14} />} label="Photos">
          <Box>
            {mediaPreviews.length > 0 && (
              <Box mb={3}>
                {/* Cover photo (large) */}
                <Box position="relative" borderRadius="12px" overflow="hidden"
                  border={`2px solid ${accent}`} mb={3}
                  style={{ aspectRatio: '16/7' }}
                >
                  <img src={mediaPreviews[primaryMediaIdx]} alt="Cover photo"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {/* Cover badge */}
                  <Box
                    position="absolute" top="8px" left="8px"
                    px="8px" py="3px" borderRadius="full"
                    bg="rgba(0,0,0,0.6)" color={WHITE}
                    fontSize="11px" fontWeight={700}
                    display="flex" alignItems="center" gap="4px"
                    style={{ backdropFilter: 'blur(4px)' }}
                  >
                    <FiStar size={10} fill={WHITE} /> Cover Photo
                  </Box>
                  {/* Remove */}
                  <Box
                    as="button"
                    position="absolute" top="8px" right="8px"
                    w="24px" h="24px" borderRadius="full"
                    bg="rgba(0,0,0,0.6)" color={WHITE}
                    display="flex" alignItems="center" justifyContent="center"
                    onClick={(e) => { e.preventDefault(); removeMedia(primaryMediaIdx) }}
                    style={{ border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                  >
                    <FiX size={12} />
                  </Box>
                </Box>

                {/* Thumbnail strip */}
                {mediaPreviews.length > 1 && (
                  <Box>
                    <Text fontSize="11px" color={GRAY400} mb={2}>
                      Click <FiStar size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> to set as cover
                    </Text>
                    <Flex gap={2} flexWrap="wrap">
                      {mediaPreviews.map((src, i) => {
                        if (i === primaryMediaIdx) return null
                        return (
                          <Box key={i} position="relative" borderRadius="9px" overflow="hidden"
                            border={`1px solid ${GRAY200}`}
                            style={{ width: '80px', height: '80px', flexShrink: 0 }}
                            cursor="pointer"
                            onClick={() => setAsPrimary(i)}
                          >
                            <img src={src} alt={`Photo ${i + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            {/* Set as cover overlay */}
                            <style>{`.thumb-overlay:hover { background: rgba(0,0,0,0.5) !important; } .thumb-overlay:hover .thumb-label { opacity: 1 !important; }`}</style>
                            <Box
                              className="thumb-overlay"
                              position="absolute" inset={0}
                              bg="rgba(0,0,0,0)"
                              display="flex" alignItems="center" justifyContent="center"
                              style={{ transition: 'background 0.15s' }}
                            >
                              <Box
                                className="thumb-label"
                                color={WHITE} fontSize="9px" fontWeight={700}
                                display="flex" flexDirection="column" alignItems="center" gap="2px"
                                style={{ opacity: 0, transition: 'opacity 0.15s', pointerEvents: 'none' }}
                              >
                                <FiStar size={14} />
                                Cover
                              </Box>
                            </Box>
                            {/* Remove button */}
                            <Box
                              as="button"
                              position="absolute" top="4px" right="4px"
                              w="18px" h="18px" borderRadius="full"
                              bg="rgba(0,0,0,0.6)" color={WHITE}
                              display="flex" alignItems="center" justifyContent="center"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMedia(i) }}
                              style={{ border: 'none', cursor: 'pointer' }}
                            >
                              <FiX size={9} />
                            </Box>
                          </Box>
                        )
                      })}

                      {/* Add more slot */}
                      {mediaFiles.length < 5 && (
                        <Box
                          as="label"
                          display="flex" flexDirection="column" alignItems="center" justifyContent="center"
                          gap={1} borderRadius="9px"
                          border={`2px dashed ${GRAY200}`}
                          cursor="pointer"
                          style={{ width: '80px', height: '80px', flexShrink: 0 }}
                          _hover={{ borderColor: GRAY300, bg: GRAY50 }}
                        >
                          <Box color={GRAY300}><FiImage size={18} /></Box>
                          <Text fontSize="9px" color={GRAY400} fontWeight={500}>Add</Text>
                          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleMedia} />
                        </Box>
                      )}
                    </Flex>
                  </Box>
                )}
              </Box>
            )}

            {/* Upload area — shown when no images yet */}
            {mediaPreviews.length === 0 && (
              <Box
                as="label"
                display="flex" flexDirection="column" alignItems="center" justifyContent="center"
                gap={2} py={8} px={4}
                border={`2px dashed ${GRAY200}`} borderRadius="12px"
                cursor="pointer" textAlign="center"
                transition="all 0.15s"
                _hover={{ borderColor: GRAY300, bg: GRAY50 }}
              >
                <Box color={GRAY300}><FiImage size={28} /></Box>
                <Text fontSize="13px" color={GRAY500} fontWeight={600}>
                  Click to upload photos
                </Text>
                <Text fontSize="11px" color={GRAY400}>
                  Up to 5 photos · PNG, JPG up to 10 MB each
                </Text>
                <Text fontSize="11px" color={GRAY400}>
                  First photo will be the cover image
                </Text>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleMedia} />
              </Box>
            )}
          </Box>
        </Section>
        )}

        {isEditMode && (
        <Section icon={<FiImage size={14} />} label="Photos">
          <Box>
            {editableMediaItems.length > 0 ? (
              <Box mb={3}>
                <Box position="relative" borderRadius="12px" overflow="hidden"
                  border={`2px solid ${accent}`} mb={3}
                  style={{ aspectRatio: '16/7' }}
                >
                  <img
                    src={editableMediaItems[0].preview}
                    alt="Cover photo"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <Box
                    position="absolute" top="8px" left="8px"
                    px="8px" py="3px" borderRadius="full"
                    bg="rgba(0,0,0,0.6)" color={WHITE}
                    fontSize="11px" fontWeight={700}
                    display="flex" alignItems="center" gap="4px"
                    style={{ backdropFilter: 'blur(4px)' }}
                  >
                    <FiStar size={10} fill={WHITE} /> Cover Photo
                  </Box>
                  <Box
                    as="button"
                    position="absolute" top="8px" right="8px"
                    w="24px" h="24px" borderRadius="full"
                    bg="rgba(0,0,0,0.6)" color={WHITE}
                    display="flex" alignItems="center" justifyContent="center"
                    onClick={(e) => {
                      e.preventDefault()
                      removeEditableMedia(editableMediaItems[0].key)
                    }}
                    style={{ border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                  >
                    <FiX size={12} />
                  </Box>
                </Box>

                {editableMediaItems.length > 1 && (
                  <Box>
                    <Text fontSize="11px" color={GRAY400} mb={2}>
                      Click <FiStar size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> to set as cover
                    </Text>
                    <Flex gap={2} flexWrap="wrap">
                      {editableMediaItems.map((item, index) => {
                        if (index === 0) return null
                        return (
                          <Box
                            key={item.key}
                            position="relative"
                            borderRadius="9px"
                            overflow="hidden"
                            border={`1px solid ${GRAY200}`}
                            style={{ width: '80px', height: '80px', flexShrink: 0 }}
                            cursor="pointer"
                            onClick={() => setEditablePrimary(index)}
                          >
                            <img
                              src={item.preview}
                              alt={`Photo ${index + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            <style>{`.edit-thumb-overlay:hover { background: rgba(0,0,0,0.5) !important; } .edit-thumb-overlay:hover .edit-thumb-label { opacity: 1 !important; }`}</style>
                            <Box
                              className="edit-thumb-overlay"
                              position="absolute" inset={0}
                              bg="rgba(0,0,0,0)"
                              display="flex" alignItems="center" justifyContent="center"
                              style={{ transition: 'background 0.15s' }}
                            >
                              <Box
                                className="edit-thumb-label"
                                color={WHITE} fontSize="9px" fontWeight={700}
                                display="flex" flexDirection="column" alignItems="center" gap="2px"
                                style={{ opacity: 0, transition: 'opacity 0.15s', pointerEvents: 'none' }}
                              >
                                <FiStar size={14} />
                                Cover
                              </Box>
                            </Box>
                            <Box
                              as="button"
                              position="absolute" top="4px" right="4px"
                              w="18px" h="18px" borderRadius="full"
                              bg="rgba(0,0,0,0.6)" color={WHITE}
                              display="flex" alignItems="center" justifyContent="center"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                removeEditableMedia(item.key)
                              }}
                              style={{ border: 'none', cursor: 'pointer' }}
                            >
                              <FiX size={9} />
                            </Box>
                          </Box>
                        )
                      })}

                      {editableMediaItems.length < 5 && (
                        <Box
                          as="label"
                          display="flex" flexDirection="column" alignItems="center" justifyContent="center"
                          gap={1} borderRadius="9px"
                          border={`2px dashed ${GRAY200}`}
                          cursor="pointer"
                          style={{ width: '80px', height: '80px', flexShrink: 0 }}
                          _hover={{ borderColor: GRAY300, bg: GRAY50 }}
                        >
                          <Box color={GRAY300}><FiImage size={18} /></Box>
                          <Text fontSize="9px" color={GRAY400} fontWeight={500}>Add</Text>
                          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleEditMedia} />
                        </Box>
                      )}
                    </Flex>
                  </Box>
                )}
              </Box>
            ) : (
              <Box
                as="label"
                display="flex" flexDirection="column" alignItems="center" justifyContent="center"
                gap={2} py={8} px={4}
                border={`2px dashed ${GRAY200}`} borderRadius="12px"
                cursor="pointer" textAlign="center"
                transition="all 0.15s"
                _hover={{ borderColor: GRAY300, bg: GRAY50 }}
              >
                <Box color={GRAY300}><FiImage size={28} /></Box>
                <Text fontSize="13px" color={GRAY500} fontWeight={600}>
                  Click to update photos
                </Text>
                <Text fontSize="11px" color={GRAY400}>
                  Crop each photo before saving · up to 5 images total
                </Text>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleEditMedia} />
              </Box>
            )}
          </Box>
        </Section>
        )}

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <Flex justify="flex-end" gap={3} pt={2} borderTop={`1px solid ${GRAY100}`}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              padding: '10px 20px', borderRadius: '10px',
              background: GRAY100, color: GRAY700,
              fontSize: '14px', fontWeight: 600,
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.65 : 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = GRAY200 }}
            onMouseLeave={(e) => { e.currentTarget.style.background = GRAY100 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '10px 24px', borderRadius: '10px',
              background: accent, color: WHITE,
              fontSize: '14px', fontWeight: 700,
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.75 : 1,
              transition: 'opacity 0.15s',
              display: 'flex', alignItems: 'center', gap: '7px',
            }}
            onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.opacity = '0.88' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = submitting ? '0.75' : '1' }}
          >
            {submitting && <Spinner size="xs" color="white" />}
            {submitting
              ? (isEditMode ? 'Saving…' : 'Posting…')
              : (isEditMode ? 'Save Changes' : (type === 'Event' ? 'Post Event' : `Post ${type}`))}
          </button>
        </Flex>

      </Stack>
    </form>
  )
}
