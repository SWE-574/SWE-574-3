import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Box, Flex, Spinner, Stack, Text } from '@chakra-ui/react'
import { FiMapPin, FiRefreshCw, FiSearch } from 'react-icons/fi'

import { serviceAPI } from '@/services/serviceAPI'
import type {
  RecommendationDebugLink,
  RecommendationDebugNode,
  RecommendationDebugResponse,
  Service,
} from '@/types'

const Plot = lazy(() => import('react-plotly.js'))

const toneColor = {
  positive: '#10B981',
  negative: '#F97316',
  neutral: '#94A3B8',
} as const

function CompactSankey({
  nodes,
  links,
}: {
  nodes: RecommendationDebugNode[]
  links: RecommendationDebugLink[]
}) {
  const plotData = useMemo(() => {
    const nodeIndexMap = new Map(nodes.map((node, index) => [node.id, index]))
    const positions = {
      positive: { x: 0.02, y: 0.04 },
      comments: { x: 0.02, y: 0.17 },
      negative: { x: 0.02, y: 0.30 },
      age: { x: 0.02, y: 0.43 },
      capacity: { x: 0.02, y: 0.56 },
      hot: { x: 0.44, y: 0.28 },
      search: { x: 0.66, y: 0.10 },
      social: { x: 0.66, y: 0.26 },
      distance: { x: 0.66, y: 0.42 },
      pin: { x: 0.66, y: 0.58 },
      card: { x: 0.93, y: 0.30 },
    } as const

    return {
      node: {
        pad: 14,
        thickness: 14,
        line: { color: 'rgba(255,255,255,0)', width: 0 },
        label: nodes.map(node => node.label),
        color: nodes.map(node => toneColor[node.tone]),
        x: nodes.map(node => positions[node.id as keyof typeof positions]?.x ?? 0.1),
        y: nodes.map(node => positions[node.id as keyof typeof positions]?.y ?? 0.5),
        hovertemplate: '%{label}<extra></extra>',
      },
      link: {
        source: links.map(link => nodeIndexMap.get(link.source) ?? 0),
        target: links.map(link => nodeIndexMap.get(link.target) ?? 0),
        value: links.map(link => link.value),
        color: links.map(link => {
          if (link.tone === 'positive') return 'rgba(16, 185, 129, 0.28)'
          if (link.tone === 'negative') return 'rgba(249, 115, 22, 0.24)'
          return 'rgba(148, 163, 184, 0.22)'
        }),
        hovertemplate: '%{source.label} -> %{target.label}<br>Weight: %{value:.2f}<extra></extra>',
      },
    }
  }, [links, nodes])

  return (
    <Box
      borderRadius="20px"
      p={3}
      bg="linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)"
      border="1px solid"
      borderColor="gray.100"
      boxShadow="inset 0 1px 0 rgba(255,255,255,0.9), 0 12px 28px rgba(15, 23, 42, 0.06)"
    >
      <Flex align="center" justify="space-between" mb={2}>
        <Text fontSize="11px" fontWeight="900" color="gray.700">
          Score Flow
        </Text>
        <Flex gap={2} align="center">
          <LegendDot color={toneColor.positive} label="Boost" />
          <LegendDot color={toneColor.negative} label="Drag" />
          <LegendDot color={toneColor.neutral} label="Context" />
        </Flex>
      </Flex>

      <Box h="212px" overflow="hidden" borderRadius="14px">
        <Suspense
          fallback={(
            <Flex h="212px" align="center" justify="center">
              <Spinner size="sm" color="orange.500" />
            </Flex>
          )}
        >
          <Plot
            data={[{
              type: 'sankey',
              arrangement: 'fixed',
              orientation: 'h',
              node: plotData.node,
              link: plotData.link,
            }]}
            layout={{
              autosize: true,
              width: 384,
              height: 212,
              margin: { l: 8, r: 8, t: 8, b: 8 },
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              font: {
                family: 'Inter, system-ui, sans-serif',
                size: 10,
                color: '#334155',
              },
            }}
            config={{
              displayModeBar: false,
              responsive: true,
              staticPlot: false,
            }}
            style={{ width: '100%', height: '212px' }}
            useResizeHandler
          />
        </Suspense>
      </Box>
    </Box>
  )
}

export default function RecommendationDebugPanel({
  services,
  hoveredServiceId,
  activeFilter,
  search,
  lat,
  lng,
  distance,
}: {
  services: Service[]
  hoveredServiceId: string | null
  activeFilter: string
  search: string
  lat?: number
  lng?: number
  distance?: number
}) {
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
  }, [activeFilter, distance, lat, lng, search, selectedServiceId, serviceIds, serviceKey])

  const selected = data?.selected_service
  const visiblePosition = selectedServiceId ? serviceIds.indexOf(selectedServiceId) + 1 : 0

  return (
    <Box
      mb={3}
      w={{ base: 'calc(100vw - 32px)', md: '420px' }}
      maxW="420px"
      maxH="72vh"
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
        '&::-webkit-scrollbar': {
          display: 'none',
        },
      }}
    >
      <Flex align="start" justify="space-between" mb={4}>
        <Box>
          <Text fontSize="sm" fontWeight="900" color="orange.600">
            Feed Debug
          </Text>
          <Text fontSize="xs" color="gray.500">
            Ranking signals for the card under your cursor.
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

            <Flex gap={2} wrap="wrap">
              <MetricPill label="Feed pos" value={visiblePosition > 0 ? `#${visiblePosition}/${serviceIds.length}` : 'n/a'} />
              <MetricPill label="Hot" value={selected.recomputed_hot_score.toFixed(3)} />
              <MetricPill label="Search" value={selected.search_score.toFixed(3)} />
              <MetricPill label="Social" value={selected.social_boost.toFixed(3)} />
              <MetricPill label="Pinned" value={selected.is_pinned ? 'Yes' : 'No'} />
              <MetricPill label="Network" value={selected.breakdown.social_reason} />
            </Flex>

            <CompactSankey nodes={selected.sankey.nodes} links={selected.sankey.links} />

            <Flex gap={2} wrap="wrap">
              <MiniStat label="P" value={String(selected.breakdown.positive_count)} />
              <MiniStat label="N" value={String(selected.breakdown.negative_count)} />
              <MiniStat label="C" value={String(selected.breakdown.comment_count)} />
              <MiniStat label="Age" value={`${selected.breakdown.age_hours.toFixed(1)}h`} />
              <MiniStat
                label="Capacity"
                value={selected.breakdown.capacity_ratio == null ? 'n/a' : `${Math.round(selected.breakdown.capacity_ratio * 100)}%`}
              />
              <MiniStat
                label="Mode"
                value={selected.breakdown.capacity_boost_applied ? 'Boosted' : 'Normal'}
              />
            </Flex>

            <SectionCard bg="gray.50">
              <Text fontSize="xs" fontWeight="800" color="gray.700" mb={2}>
                Formula snapshot
              </Text>
              <Stack gap={1}>
                {selected.formula_lines.map(line => (
                  <Text key={line} fontSize="xs" color="gray.600" fontFamily="mono">
                    {line}
                  </Text>
                ))}
              </Stack>
            </SectionCard>

            {selected.notes.length > 0 ? (
              <SectionCard bg="orange.50">
                <Stack gap={1}>
                  {selected.notes.map(note => (
                    <Text key={note} fontSize="xs" color="orange.700">
                      {note}
                    </Text>
                  ))}
                </Stack>
              </SectionCard>
            ) : null}
          </>
        ) : (
          <SectionCard bg="gray.50">
            <Text fontSize="sm" color="gray.600">
              Open the panel and hover a visible card to inspect its ranking inputs.
            </Text>
          </SectionCard>
        )}
      </Stack>
    </Box>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <Box
      minW="76px"
      px={2.5}
      py={2}
      borderRadius="14px"
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      boxShadow="0 2px 10px rgba(15, 23, 42, 0.04)"
    >
      <Text fontSize="10px" color="gray.500" fontWeight="700">{label}</Text>
      <Text fontSize="xs" color="gray.800" fontWeight="900" mt="2px">{value}</Text>
    </Box>
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
    blue: { bg: 'blue.50', color: 'blue.700' },
    green: { bg: 'green.50', color: 'green.700' },
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Flex align="center" gap={1}>
      <Box w="7px" h="7px" borderRadius="full" bg={color} />
      <Text fontSize="10px" color="gray.500" fontWeight="700">{label}</Text>
    </Flex>
  )
}
