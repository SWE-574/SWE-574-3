import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Flex, Spinner, Text } from '@chakra-ui/react'
import { FiCalendar, FiMapPin, FiUsers } from 'react-icons/fi'
import { serviceAPI } from '@/services/serviceAPI'
import { useGeoStore } from '@/store/useGeoStore'
import type { Service } from '@/types'
import {
  AMBER, AMBER_LT, GRAY100, GRAY200, GRAY400, GRAY500, GRAY600,
  GRAY700, GRAY800, GRAY900, WHITE,
} from '@/theme/tokens'

// FR-19a — dedicated events discovery surface. The backend already supports
// `?type=Event&date_from=…&date_to=…&distance=…` (#285); this page is the
// purpose-built UI entry point spec required.

type DatePreset = 'all' | 'today' | 'this_week' | 'this_weekend' | 'next_week'

interface DateRange {
  from?: string
  to?: string
}

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'Anytime' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_weekend', label: 'This weekend' },
  { key: 'next_week', label: 'Next week' },
]

const DISTANCE_PRESETS: { km: number | null; label: string }[] = [
  { km: null, label: 'Any distance' },
  { km: 5, label: '5 km' },
  { km: 25, label: '25 km' },
  { km: 100, label: '100 km' },
]

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function rangeForPreset(preset: DatePreset): DateRange {
  if (preset === 'all') return {}
  const now = new Date()
  const today = startOfDay(now)

  if (preset === 'today') {
    return { from: today.toISOString(), to: endOfDay(now).toISOString() }
  }

  // ISO week starts Monday; getDay() returns 0=Sunday..6=Saturday. Convert.
  const dow = (today.getDay() + 6) % 7  // 0=Mon..6=Sun
  const monday = new Date(today)
  monday.setDate(today.getDate() - dow)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  if (preset === 'this_week') {
    return { from: monday.toISOString(), to: endOfDay(sunday).toISOString() }
  }
  if (preset === 'this_weekend') {
    const saturday = new Date(monday)
    saturday.setDate(monday.getDate() + 5)
    return { from: saturday.toISOString(), to: endOfDay(sunday).toISOString() }
  }
  if (preset === 'next_week') {
    const nextMon = new Date(monday)
    nextMon.setDate(monday.getDate() + 7)
    const nextSun = new Date(nextMon)
    nextSun.setDate(nextMon.getDate() + 6)
    return { from: nextMon.toISOString(), to: endOfDay(nextSun).toISOString() }
  }
  return {}
}

function formatEventDate(iso: string | null | undefined): string {
  if (!iso) return 'Date TBD'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function spotsLabel(service: Service): string {
  const cap = service.max_participants ?? 0
  const taken = service.participant_count ?? 0
  if (cap <= 1) return ''
  const left = Math.max(0, cap - taken)
  if (left === 0) return 'Full'
  return `${left} / ${cap} left`
}

export default function EventsPage() {
  const geoLocation = useGeoStore((s) => s.geoLocation)
  const hasGeo = !!geoLocation && (geoLocation.latitude !== 0 || geoLocation.longitude !== 0)
  const [preset, setPreset] = useState<DatePreset>('all')
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [events, setEvents] = useState<Service[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    setError(null)
    setEvents(null)

    const range = rangeForPreset(preset)
    const params: Parameters<typeof serviceAPI.list>[0] = {
      type: 'Event',
      sort: 'latest',
      page_size: 50,
      ...(range.from ? { date_from: range.from } : {}),
      ...(range.to ? { date_to: range.to } : {}),
    }
    if (distanceKm != null && hasGeo && geoLocation) {
      params.lat = geoLocation.latitude
      params.lng = geoLocation.longitude
      params.distance = distanceKm
    }

    serviceAPI.list(params, ac.signal)
      .then(setEvents)
      .catch((err) => {
        if (ac.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load events')
        setEvents([])
      })

    return () => ac.abort()
  }, [preset, distanceKm, hasGeo, geoLocation])

  const visible = useMemo(() => events ?? [], [events])

  return (
    <Box maxW="1100px" mx="auto" px={{ base: 4, md: 6 }} py={{ base: 4, md: 8 }}>
      <Flex direction="column" gap={1} mb={6}>
        <Text fontSize="22px" fontWeight={700} color={GRAY900}>Events near you</Text>
        <Text fontSize="13px" color={GRAY500}>
          Browse, filter, and join events organised by people in your community.
        </Text>
      </Flex>

      <Flex direction={{ base: 'column', md: 'row' }} gap={3} mb={5} wrap="wrap">
        <Box>
          <Text fontSize="11px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.04em" mb={2}>
            When
          </Text>
          <Flex gap={2} wrap="wrap">
            {DATE_PRESETS.map(({ key, label }) => {
              const active = preset === key
              return (
                <Box
                  as="button"
                  key={key}
                  onClick={() => setPreset(key)}
                  px="14px" py="7px" borderRadius="8px"
                  fontSize="12px" fontWeight={500}
                  style={{
                    background: active ? GRAY900 : WHITE,
                    color: active ? WHITE : GRAY700,
                    border: `1px solid ${active ? GRAY900 : GRAY200}`,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </Box>
              )
            })}
          </Flex>
        </Box>

        <Box>
          <Text fontSize="11px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.04em" mb={2}>
            Where
          </Text>
          <Flex gap={2} wrap="wrap">
            {DISTANCE_PRESETS.map(({ km, label }) => {
              const active = distanceKm === km
              const disabled = km != null && !hasGeo
              return (
                <Box
                  as="button"
                  key={String(km)}
                  onClick={() => !disabled && setDistanceKm(km)}
                  px="14px" py="7px" borderRadius="8px"
                  fontSize="12px" fontWeight={500}
                  title={disabled ? 'Allow location to filter by distance.' : undefined}
                  style={{
                    background: active ? GRAY900 : WHITE,
                    color: active ? WHITE : disabled ? GRAY400 : GRAY700,
                    border: `1px solid ${active ? GRAY900 : GRAY200}`,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  {label}
                </Box>
              )
            })}
          </Flex>
        </Box>
      </Flex>

      {events === null && (
        <Flex minH="220px" justify="center" align="center"><Spinner /></Flex>
      )}

      {events !== null && error && (
        <Flex
          align="center" gap={2} px={4} py={3}
          borderRadius="10px"
          style={{ background: AMBER_LT, border: `1px solid ${AMBER}`, color: GRAY800 }}
        >
          <Text fontSize="13px">{error}</Text>
        </Flex>
      )}

      {events !== null && !error && visible.length === 0 && (
        <Flex
          minH="180px" justify="center" align="center" direction="column" gap={2}
          borderRadius="12px"
          style={{ background: GRAY100, border: `1px dashed ${GRAY200}` }}
        >
          <Text fontSize="14px" color={GRAY600}>No events match those filters.</Text>
          <Text fontSize="12px" color={GRAY400}>
            Try a wider date range or larger distance.
          </Text>
        </Flex>
      )}

      <Flex direction="column" gap={3}>
        {visible.map((event) => (
          <RouterLink
            key={event.id}
            to={`/service-detail/${event.id}`}
            style={{ textDecoration: 'none' }}
          >
            <Box
              p={4}
              borderRadius="12px"
              style={{ background: WHITE, border: `1px solid ${GRAY200}` }}
            >
              <Flex justify="space-between" align="flex-start" gap={4}>
                <Box flex={1} minW={0}>
                  <Text fontSize="15px" fontWeight={700} color={GRAY900} mb={1}>
                    {event.title}
                  </Text>
                  <Flex align="center" gap={4} mb={2} fontSize="12px" color={GRAY600}>
                    <Flex align="center" gap={1.5}>
                      <FiCalendar size={12} />
                      <Text>{formatEventDate(event.scheduled_time ?? null)}</Text>
                    </Flex>
                    {event.location_area && (
                      <Flex align="center" gap={1.5}>
                        <FiMapPin size={12} />
                        <Text>{event.location_area}</Text>
                      </Flex>
                    )}
                    {event.max_participants > 1 && (
                      <Flex align="center" gap={1.5}>
                        <FiUsers size={12} />
                        <Text>{spotsLabel(event)}</Text>
                      </Flex>
                    )}
                  </Flex>
                  <Text fontSize="12px" color={GRAY500} lineHeight={1.55}>
                    {event.description?.slice(0, 180)}
                    {(event.description?.length ?? 0) > 180 ? '…' : ''}
                  </Text>
                </Box>
                {event.user && (
                  <Box flexShrink={0} textAlign="right">
                    <Text fontSize="11px" color={GRAY400} textTransform="uppercase" letterSpacing="0.04em">
                      Organised by
                    </Text>
                    <Text fontSize="13px" fontWeight={500} color={GRAY700}>
                      {event.user.first_name} {event.user.last_name}
                    </Text>
                  </Box>
                )}
              </Flex>
            </Box>
          </RouterLink>
        ))}
      </Flex>
    </Box>
  )
}
