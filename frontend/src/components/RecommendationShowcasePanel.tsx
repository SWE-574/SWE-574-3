import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Box, Flex, Spinner, Stack, Text } from '@chakra-ui/react'
import { FiChevronDown, FiChevronRight, FiMapPin, FiRefreshCw, FiSearch } from 'react-icons/fi'

import { serviceAPI } from '@/services/serviceAPI'
import type {
  RecommendationDebugDiagnosisClass,
  RecommendationDebugFactors,
  RecommendationDebugFactorsEvent,
  RecommendationDebugFactorsService,
  RecommendationDebugPhase1,
  RecommendationDebugPhase2B,
  RecommendationDebugPhase3,
  RecommendationDebugResponse,
  RecommendationDebugSelectedService,
  RecommendationDebugSort,
  Service,
} from '@/types'

const DIAGNOSIS_PALETTE: Record<RecommendationDebugDiagnosisClass, { bg: string; fg: string; border: string }> = {
  explore:       { bg: 'blue.50',   fg: 'blue.800',   border: 'blue.200'   },
  trust:         { bg: 'red.50',    fg: 'red.800',    border: 'red.200'    },
  proximity:     { bg: 'orange.50', fg: 'orange.800', border: 'orange.200' },
  pin:           { bg: 'purple.50', fg: 'purple.800', border: 'purple.200' },
  tie:           { bg: 'gray.100',  fg: 'gray.800',   border: 'gray.300'   },
  chronological: { bg: 'teal.50',   fg: 'teal.800',   border: 'teal.200'   },
  neutral:       { bg: 'gray.50',   fg: 'gray.700',   border: 'gray.200'   },
}

const PANEL_PROPS = {
  services: [] as Service[],
  hoveredServiceId: null as string | null,
  activeFilter: 'all',
  search: '',
} as const

type PanelProps = {
  services: Service[]
  hoveredServiceId: string | null
  activeFilter: string
  search: string
  lat?: number
  lng?: number
  distance?: number
  phase3InjectedId?: string | null
  phase3SlotIndex?: number | null
}

export default function RecommendationDebugPanel({
  services,
  hoveredServiceId,
  activeFilter,
  search,
  lat,
  lng,
  distance,
  phase3InjectedId = null,
  phase3SlotIndex = null,
}: PanelProps = PANEL_PROPS) {
  const [data, setData] = useState<RecommendationDebugResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedData = useRef(false)

  const serviceIds = useMemo(() => services.map(service => service.id), [services])
  const selectedServiceId = hoveredServiceId ?? serviceIds[0] ?? null
  const serviceKey = useMemo(() => serviceIds.join(','), [serviceIds])

  useEffect(() => {
    if (!selectedServiceId || serviceIds.length === 0) {
      setData(null)
      return
    }

    const controller = new AbortController()

    const load = async () => {
      setError(null)
      setIsLoading(!hasLoadedData.current)
      setIsRefreshing(hasLoadedData.current)

      try {
        const response = await serviceAPI.getRankingDebug({
          service_ids: serviceIds,
          selected_service_id: selectedServiceId,
          search,
          lat,
          lng,
          distance,
          active_filter: activeFilter,
          phase3_injected_id: phase3InjectedId,
          phase3_slot_index: phase3SlotIndex,
        }, controller.signal)
        setData(response)
        hasLoadedData.current = true
      } catch (errorValue: unknown) {
        const typedError = errorValue as { name?: string; code?: string; message?: string }
        if (typedError?.name === 'CanceledError' || typedError?.code === 'ERR_CANCELED') return
        setError(typedError?.message ?? 'Failed to load debug breakdown')
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }

    load()
    return () => controller.abort()
  }, [activeFilter, distance, lat, lng, phase3InjectedId, phase3SlotIndex, search, selectedServiceId, serviceIds, serviceKey])

  const selected = data?.selected_service
  const visiblePosition = selectedServiceId ? serviceIds.indexOf(selectedServiceId) + 1 : 0
  const defaultOpenPhase = selected ? phaseFromDiagnosis(selected.diagnosis.class) : null

  return (
    <Box
      mb={3}
      w={{ base: 'calc(100vw - 32px)', md: '440px' }}
      maxW="440px"
      maxH="78vh"
      overflowY="auto"
      p={4}
      borderRadius="26px"
      border="1px solid"
      borderColor="orange.100"
      bg="linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.97) 100%)"
      backdropFilter="blur(16px)"
      boxShadow="0 22px 60px rgba(15, 23, 42, 0.16)"
      css={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      <Flex align="start" justify="space-between" mb={4}>
        <Box>
          <Text fontSize="sm" fontWeight="900" color="orange.600">
            Recommendation Showcase
          </Text>
          <Text fontSize="xs" color="gray.500">
            Hover a card to trace the full ranking pipeline.
          </Text>
        </Box>
        {isRefreshing ? <StatusChip label="Syncing" icon={<FiRefreshCw size={11} />} /> : null}
      </Flex>

      <Stack gap={3}>
        <Flex gap={2} wrap="wrap">
          <ContextChip label={`Filter: ${activeFilter}`} color="orange" />
          {search ? <ContextChip label={search} icon={<FiSearch size={11} />} color="blue" /> : null}
          {selected?.distance_km != null ? (
            <ContextChip label={`${selected.distance_km.toFixed(1)} km`} icon={<FiMapPin size={11} />} color="green" />
          ) : null}
        </Flex>

        {isLoading ? (
          <Flex align="center" justify="center" minH="220px">
            <Spinner color="orange.500" />
          </Flex>
        ) : error ? (
          <SectionCard bg="red.50">
            <Text fontSize="sm" color="red.700" fontWeight="800">{error}</Text>
          </SectionCard>
        ) : selected ? (
          <>
            <SectionCard>
              <Text fontSize="sm" fontWeight="900" color="gray.900" lineHeight="1.3">
                {selected.title}
              </Text>
              <Text fontSize="xs" color="gray.500" mt={1}>
                {selected.type} by {selected.owner_name}
              </Text>
            </SectionCard>

            <DiagnosisCard
              positionLabel={visiblePosition > 0 ? `#${visiblePosition} of ${serviceIds.length}` : 'n/a'}
              diagnosis={selected.diagnosis}
            />

            <PipelineAccordion title="Phase 1 — Filter" defaultOpen={defaultOpenPhase === 'phase1'}>
              <Phase1Body phase1={selected.phase1} />
            </PipelineAccordion>

            <PipelineAccordion title="Phase 2a — Hot score" defaultOpen={defaultOpenPhase === 'phase2a'}>
              <Phase2ABody factors={selected.factors} formulaLines={selected.formula_lines} selected={selected} />
            </PipelineAccordion>

            <PipelineAccordion title="Phase 2b — Composite" defaultOpen={defaultOpenPhase === 'phase2b'}>
              <Phase2BBody phase2b={selected.phase2b} />
            </PipelineAccordion>

            <PipelineAccordion title="Phase 3 — Rerank" defaultOpen={defaultOpenPhase === 'phase3'}>
              <Phase3Body phase3={selected.phase3} />
            </PipelineAccordion>

            <PipelineAccordion title="Sort & position" defaultOpen={defaultOpenPhase === 'sort'}>
              <SortBody sort={selected.sort} />
            </PipelineAccordion>

            {selected.notes.length > 0 ? (
              <SectionCard bg="orange.50">
                <Stack gap={1}>
                  {selected.notes.map(note => (
                    <Text key={note} fontSize="xs" color="orange.700">{note}</Text>
                  ))}
                </Stack>
              </SectionCard>
            ) : null}
          </>
        ) : (
          <SectionCard bg="gray.50">
            <Text fontSize="sm" color="gray.600">
              Hover a visible card to inspect how each phase scored it.
            </Text>
          </SectionCard>
        )}
      </Stack>
    </Box>
  )
}

function phaseFromDiagnosis(klass: RecommendationDebugDiagnosisClass): string {
  switch (klass) {
    case 'explore':       return 'phase3'
    case 'trust':         return 'phase2a'
    case 'proximity':     return 'phase2b'
    case 'pin':           return 'sort'
    case 'tie':           return 'sort'
    case 'chronological': return 'sort'
    default:              return 'phase2a'
  }
}

function DiagnosisCard({
  positionLabel,
  diagnosis,
}: {
  positionLabel: string
  diagnosis: RecommendationDebugSelectedService['diagnosis']
}) {
  const palette = DIAGNOSIS_PALETTE[diagnosis.class]
  return (
    <Box bg={palette.bg} border="1px solid" borderColor={palette.border} borderRadius="18px" p={3}>
      <Text fontSize="11px" color={palette.fg} fontWeight="900" letterSpacing="0.06em" textTransform="uppercase">
        Position {positionLabel}
      </Text>
      <Text fontSize="sm" color={palette.fg} fontWeight="800" mt={1} lineHeight="1.4">
        {diagnosis.message}
      </Text>
    </Box>
  )
}

function PipelineAccordion({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <Box border="1px solid" borderColor="gray.200" borderRadius="16px" bg="whiteAlpha.900">
      <Flex
        as="button"
        onClick={() => setOpen(value => !value)}
        align="center"
        justify="space-between"
        w="100%"
        px={3}
        py={2.5}
        bg="transparent"
      >
        <Text fontSize="xs" fontWeight="900" color="gray.700" letterSpacing="0.04em" textTransform="uppercase">
          {title}
        </Text>
        {open ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
      </Flex>
      {open ? (
        <Box px={3} pb={3}>
          {children}
        </Box>
      ) : null}
    </Box>
  )
}

function Phase1Body({ phase1 }: { phase1: RecommendationDebugPhase1 }) {
  const sortLabel = (() => {
    if (phase1.sort_mode === 'composite')   return 'composite_score (hot sort)'
    if (phase1.sort_mode === 'explore_only') return 'explore rotation'
    return 'created_at (chronological)'
  })()
  return (
    <Stack gap={2}>
      {phase1.sort_mode !== 'composite' ? (
        <Box bg="amber.50" border="1px solid" borderColor="amber.200" borderRadius="10px" p={2}>
          <Text fontSize="xs" color="amber.800" fontWeight="800">
            {phase1.sort_mode === 'chronological'
              ? `In '${phase1.active_filter}' mode the list is sorted by created_at descending. Composite_score below is informational and does not decide order.`
              : `In '${phase1.active_filter}' mode the list comes from the Phase 3 explore rotation, not composite ranking.`}
          </Text>
        </Box>
      ) : null}
      <Flex gap={2} wrap="wrap">
        <MiniStat label="Filter" value={phase1.active_filter} />
        <MiniStat label="Sort" value={sortLabel} />
        <MiniStat label="Type" value={phase1.service_type} />
        <MiniStat label="Location" value={phase1.location_type} />
        <MiniStat label="Search" value={phase1.search_score.toFixed(3)} />
        <MiniStat
          label="Distance"
          value={phase1.distance_km == null ? 'n/a' : `${phase1.distance_km.toFixed(1)} km`}
        />
        <MiniStat label="Pinned" value={phase1.is_pinned ? 'Yes' : 'No'} />
      </Flex>
    </Stack>
  )
}

function Phase2ABody({
  factors,
  formulaLines,
  selected,
}: {
  factors: RecommendationDebugFactors
  formulaLines: string[]
  selected: RecommendationDebugSelectedService
}) {
  const isEvent = factors.kind === 'event'
  const quality = isEvent
    ? (factors as RecommendationDebugFactorsEvent).organiser_quality
    : (factors as RecommendationDebugFactorsService).quality
  const qualityIsZero = quality === 0
  const stats = isEvent
    ? [
        { label: 'P', value: String((factors as RecommendationDebugFactorsEvent).positive_count) },
        { label: 'N', value: String((factors as RecommendationDebugFactorsEvent).negative_count) },
        { label: 'RSVPs 7d', value: String((factors as RecommendationDebugFactorsEvent).rsvps_last_7d) },
      ]
    : [
        { label: 'P', value: String((factors as RecommendationDebugFactorsService).positive_count) },
        { label: 'N', value: String((factors as RecommendationDebugFactorsService).negative_count) },
        { label: 'C', value: String((factors as RecommendationDebugFactorsService).comment_count) },
        { label: 'Hours', value: (factors as RecommendationDebugFactorsService).hours_exchanged.toFixed(1) },
      ]
  return (
    <Stack gap={2}>
      <Flex gap={2} wrap="wrap">
        {stats.map(stat => <MiniStat key={stat.label} label={stat.label} value={stat.value} />)}
        <MiniStat label="Newcomer" value={factors.is_newcomer ? `×${factors.newcomer_boost.toFixed(2)}` : 'No'} />
        <MiniStat label="Capacity" value={factors.capacity_multiplier === 1 ? '×1.00' : `×${factors.capacity_multiplier.toFixed(2)}`} />
      </Flex>
      <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="10px" p={2}>
        <Stack gap={1}>
          {formulaLines.map(line => {
            const flagsZero = qualityIsZero
              && (line.toLowerCase().includes('quality')
                || line.toLowerCase().includes('organiser'))
            return (
              <Flex key={line} gap={2} align="center">
                <Text fontSize="xs" color="gray.700" fontFamily="mono" flex={1}>
                  {line}
                </Text>
                {flagsZero ? (
                  <Box bg="red.100" color="red.800" px={2} py="2px" borderRadius="6px">
                    <Text fontSize="9px" fontWeight="900">× zeros total</Text>
                  </Box>
                ) : null}
              </Flex>
            )
          })}
        </Stack>
      </Box>
      <Flex gap={2}>
        <MiniStat label="Stored hot" value={selected.stored_hot_score.toFixed(3)} />
        <MiniStat label="Recomputed" value={selected.recomputed_hot_score.toFixed(3)} />
      </Flex>
    </Stack>
  )
}

function Phase2BBody({ phase2b }: { phase2b: RecommendationDebugPhase2B }) {
  const noProximity = phase2b.distance_km == null
  return (
    <Stack gap={2}>
      <Flex gap={2} wrap="wrap">
        <MiniStat label="Hot" value={phase2b.hot_score.toFixed(3)} />
        <MiniStat
          label="Proximity"
          value={noProximity ? 'n/a' : `×${phase2b.proximity_factor.toFixed(2)}`}
        />
        <MiniStat
          label="Distance"
          value={noProximity ? 'n/a' : `${phase2b.distance_km!.toFixed(1)} km`}
        />
        <MiniStat label="Half-life" value={`${phase2b.proximity_half_life_km.toFixed(0)} km`} />
        <MiniStat label="Social" value={phase2b.social_boost.toFixed(2)} />
        <MiniStat label="Network" value={phase2b.social_reason} />
      </Flex>
      <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="10px" p={2}>
        <Text fontSize="xs" fontFamily="mono" color="gray.700">
          composite = {phase2b.hot_score.toFixed(3)}
          {noProximity ? '' : ` × ${phase2b.proximity_factor.toFixed(3)}`}
          {' + 0.5 × '}
          {phase2b.social_boost.toFixed(3)}
          {' = '}
          <Text as="span" fontWeight="900">{phase2b.composite_score.toFixed(3)}</Text>
        </Text>
      </Box>
    </Stack>
  )
}

function Phase3Body({ phase3 }: { phase3: RecommendationDebugPhase3 }) {
  return (
    <Stack gap={2}>
      {phase3.injected_on_this_request ? (
        <Box bg="green.50" border="1px solid" borderColor="green.300" borderRadius="10px" p={2}>
          <Text fontSize="xs" color="green.800" fontWeight="900">
            Injected at slot {phase3.injected_slot_index ?? '?'} on this request.
          </Text>
        </Box>
      ) : null}
      <Flex gap={2} wrap="wrap">
        <MiniStat label="Pool" value={phase3.pool ?? 'none'} />
        <MiniStat label="Explore rate" value={`${Math.round(phase3.exploration_rate * 100)}%`} />
        <MiniStat label="Owner h.shakes" value={String(phase3.lifetime_completed_handshakes)} />
        <MiniStat
          label="Days idle"
          value={
            phase3.days_since_last_completed_handshake == null
              ? 'never'
              : `${phase3.days_since_last_completed_handshake}d`
          }
        />
      </Flex>
      <Text fontSize="xs" color="gray.600">
        {phase3.pool === 'cold_start'
          ? `Eligible because the owner has < ${phase3.cold_start_threshold} completed handshakes.`
          : phase3.pool === 'undershown_quality'
            ? `Eligible because quality is high but the service has had no completed handshake in the last ${phase3.undershown_stale_days} days.`
            : phase3.pool === 'stale_recurring'
              ? 'Eligible because the recurring growth check flagged this listing as stale.'
              : 'Not eligible for the explore bucket. Served from the regular hot list.'}
        {phase3.injected_card_id && !phase3.injected_on_this_request
          ? ` On this request the explore slot went to a different card (${phase3.injected_card_id.slice(0, 8)}…).`
          : ''}
      </Text>
    </Stack>
  )
}

function SortBody({ sort }: { sort: RecommendationDebugSort }) {
  const isComposite = sort.sort_mode === 'composite'
  const cardKeyLine = isComposite
    ? `(${String(sort.this_card_key.is_pinned)}, ${sort.this_card_key.composite_score.toFixed(3)}, ${new Date(sort.this_card_key.created_at).toISOString().slice(0, 10)})`
    : `(${String(sort.this_card_key.is_pinned)}, ${new Date(sort.this_card_key.created_at).toISOString().slice(0, 10)})`
  return (
    <Stack gap={2}>
      <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="10px" p={2}>
        <Text fontSize="xs" fontFamily="mono" color="gray.700">
          Sort key: {sort.sort_key}
        </Text>
        <Text fontSize="xs" fontFamily="mono" color="gray.700" mt={1}>
          This card: {cardKeyLine}
        </Text>
        {sort.pinned_count_in_list > 0 ? (
          <Text fontSize="xs" color="purple.700" fontWeight="800" mt={1}>
            {sort.pinned_count_in_list} pinned card(s) on this page sit above all unpinned cards.
          </Text>
        ) : null}
      </Box>
      <Stack gap={1}>
        {sort.neighbours.map(neighbour => {
          const tail = isComposite
            ? `(${neighbour.is_pinned ? 'P' : '·'}, ${neighbour.composite_score.toFixed(3)})`
            : `(${neighbour.is_pinned ? 'P' : '·'}, ${new Date(neighbour.created_at).toISOString().slice(0, 10)})`
          return (
            <Flex
              key={neighbour.id}
              align="center"
              gap={2}
              px={2}
              py={1.5}
              bg={neighbour.is_selected ? 'orange.50' : 'transparent'}
              border="1px solid"
              borderColor={neighbour.is_selected ? 'orange.200' : 'gray.100'}
              borderRadius="8px"
            >
              <Text fontSize="xs" color="gray.500" w="36px">#{neighbour.position}</Text>
              <Text fontSize="xs" color="gray.800" flex={1} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {neighbour.title}
              </Text>
              <Text fontSize="10px" fontFamily="mono" color="gray.600">
                {tail}
              </Text>
            </Flex>
          )
        })}
      </Stack>
    </Stack>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Flex
      align="center"
      gap={1.5}
      px={2.5}
      py={1.5}
      bg="whiteAlpha.900"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="12px"
    >
      <Text fontSize="10px" color="gray.500" fontWeight="700">{label}</Text>
      <Text fontSize="10px" color="gray.800" fontWeight="900">{value}</Text>
    </Flex>
  )
}

function ContextChip({
  label,
  icon,
  color,
}: {
  label: string
  icon?: ReactNode
  color: 'orange' | 'blue' | 'green'
}) {
  const palette = {
    orange: { bg: 'orange.50', color: 'orange.700' },
    blue:   { bg: 'blue.50',   color: 'blue.700'   },
    green:  { bg: 'green.50',  color: 'green.700'  },
  }[color]

  return (
    <Box px={2.5} py={1.5} bg={palette.bg} color={palette.color} borderRadius="full">
      <Flex align="center" gap={1.5}>
        {icon}
        <Text fontSize="11px" fontWeight="800">{label}</Text>
      </Flex>
    </Box>
  )
}

function SectionCard({
  children,
  bg = 'whiteAlpha.900',
}: {
  children: ReactNode
  bg?: string
}) {
  return (
    <Box
      borderRadius="18px"
      bg={bg}
      p={3}
      border="1px solid"
      borderColor="whiteAlpha.700"
      boxShadow="0 8px 24px rgba(15, 23, 42, 0.04)"
    >
      {children}
    </Box>
  )
}

function StatusChip({ label, icon }: { label: string; icon?: ReactNode }) {
  return (
    <Box px={2} py="4px" borderRadius="full" bg="gray.100">
      <Flex align="center" gap={1.5}>
        {icon}
        <Text fontSize="10px" fontWeight="800" color="gray.600">{label}</Text>
      </Flex>
    </Box>
  )
}
