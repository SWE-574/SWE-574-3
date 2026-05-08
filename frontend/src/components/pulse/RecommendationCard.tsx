import { useState } from 'react'
import {
  Box,
  Flex,
  HStack,
  Spinner,
  Stack,
  Text,
  type BoxProps,
} from '@chakra-ui/react'
import {
  FiBookmark,
  FiCalendar,
  FiClock,
  FiInfo,
  FiMapPin,
  FiSlash,
  FiStar,
} from 'react-icons/fi'
import { Link as RouterLink, useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import WhyThisPanel from '@/components/pulse/WhyThisPanel'
import { pulseAPI } from '@/services/pulseAPI'
import { serviceAPI } from '@/services/serviceAPI'
import {
  AMBER, BLUE, GREEN, HERO_GRADIENT,
} from '@/theme/tokens'
import type { Service } from '@/types'
import { chipForSignals } from '@/utils/forYouChips'

export type PulseLane =
  | 'hero'
  | 'for_you'
  | 'worth_a_look'
  | 'nearby'
  | 'events'
  | 'help_others'

interface Props {
  service: Service
  lane: PulseLane
  /** Removes the card from its parent list. Used for "Not interested". */
  onDismissed?: (serviceId: string) => void
  /** Visual variant — hero is bigger and uses a gradient stripe. */
  variant?: 'hero' | 'compact'
}

const SOURCE_LABEL: Record<PulseLane, string> = {
  hero: 'Top pick for you',
  for_you: 'For you',
  worth_a_look: 'Worth a look',
  nearby: 'Nearby',
  events: 'Event for you',
  help_others: 'Neighbour needs help',
}

const SOURCE_ACCENT: Record<PulseLane, string> = {
  hero: HERO_GRADIENT,
  for_you: GREEN,
  worth_a_look: AMBER,
  nearby: BLUE,
  events: AMBER,
  help_others: BLUE,
}

function matchPercent(s: Service): number | null {
  const sig = s.for_you_signals
  if (!sig) return null
  const raw = sig.tag * 0.5 + sig.follow * 0.3 + sig.cooccur * 0.2
  if (raw <= 0) return null
  return Math.min(99, Math.round(raw * 100))
}

function explorePoolLabel(pool: Service['explore_pool']): string | null {
  if (pool === 'cold_start') return 'Fresh provider'
  if (pool === 'undershown_quality') return 'Hidden gem'
  if (pool === 'stale_recurring') return 'Rediscovered'
  return null
}

const formatDuration = (d: number | string | null | undefined): string | null => {
  if (d === null || d === undefined || d === '') return null
  const n = Number(d)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${n}h`
}

export default function RecommendationCard({
  service,
  lane,
  onDismissed,
  variant = 'compact',
}: Props) {
  const navigate = useNavigate()
  const [isSaved, setIsSaved] = useState(Boolean(service.is_saved))
  const [savePending, setSavePending] = useState(false)
  const [requestPending, setRequestPending] = useState(false)
  const [requested, setRequested] = useState(false)
  const [dismissPending, setDismissPending] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)

  const chip = chipForSignals(service.for_you_signals)
  const pct = matchPercent(service)
  const exploreLabel = explorePoolLabel(service.explore_pool)
  const owner = service.user
  const area = service.location_area || service.location_type
  const sourceLabel = SOURCE_LABEL[lane]
  const accent = SOURCE_ACCENT[lane]
  const isHero = variant === 'hero'

  const detailHref = `/service-detail/${service.id}?from=pulse_${lane}`

  const durationLabel = formatDuration(service.duration)

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (savePending) return
    const next = !isSaved
    setIsSaved(next)
    setSavePending(true)
    try {
      await serviceAPI.setSaved(service.id, next)
    } catch (err) {
      setIsSaved(!next)
      console.error('RecommendationCard: save failed', err)
    } finally {
      setSavePending(false)
    }
  }

  const handleRequest = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (requestPending || requested) return
    setRequestPending(true)
    try {
      await serviceAPI.expressInterest(service.id)
      setRequested(true)
    } catch {
      navigate(detailHref)
    } finally {
      setRequestPending(false)
    }
  }

  const handleDismiss = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dismissPending) return
    setDismissPending(true)
    try {
      await pulseAPI.setDismissed(service.id, true)
      onDismissed?.(service.id)
    } catch (err) {
      console.error('RecommendationCard: dismiss failed', err)
    } finally {
      setDismissPending(false)
    }
  }

  const cardRadius = isHero ? '18px' : '14px'
  const cardProps: BoxProps = {
    bg: 'white',
    borderRadius: cardRadius,
    borderWidth: isHero ? '0' : '1px',
    borderColor: 'gray.200',
    transition: 'all 0.18s ease',
    _hover: {
      transform: 'translateY(-2px)',
      borderColor: 'green.200',
      boxShadow: '0 12px 24px rgba(45, 92, 78, 0.14)',
    },
  }

  const iconBtnSize = isHero ? '34px' : '30px'
  const iconBtnIconSize = isHero ? 15 : 13

  return (
    <Box position="relative" {...cardProps} data-testid="recommendation-card">
      <Box
        height={isHero ? '6px' : '4px'}
        background={accent}
        borderTopLeftRadius={cardRadius}
        borderTopRightRadius={cardRadius}
      />

      <RouterLink to={detailHref} style={{ textDecoration: 'none' }}>
        <Stack p={isHero ? '18px 20px 6px' : '14px 16px 4px'} gap={2}>
          <Flex align="center" gap={2} flexWrap="wrap">
            <Flex
              align="center" gap="4px"
              px="8px"
              py="3px"
              borderRadius="999px"
              fontSize="10px"
              fontWeight={700}
              textTransform="uppercase"
              letterSpacing="0.4px"
              bg={lane === 'hero' ? 'green.50' : '#FEF6DC'}
              color={lane === 'hero' ? 'green.700' : 'gray.800'}
              borderWidth="1px"
              borderColor={lane === 'hero' ? 'green.200' : '#F5DD8E'}
            >
              <FiStar size={10} />
              <Box as="span">
                {sourceLabel}
                {pct ? ` · ${pct}%` : ''}
              </Box>
            </Flex>
            {exploreLabel ? (
              <Box
                px="8px"
                py="2px"
                borderRadius="999px"
                fontSize="10px"
                fontWeight={600}
                color="emerald.700"
                borderWidth="1px"
                borderColor="emerald.200"
                bg="emerald.50"
              >
                ↗ {exploreLabel}
              </Box>
            ) : null}
            <Box
              as="button"
              ml="auto"
              w="22px"
              h="22px"
              borderRadius="full"
              bg={whyOpen ? 'gray.100' : 'transparent'}
              color="gray.500"
              borderWidth="1px"
              borderColor={whyOpen ? 'gray.200' : 'transparent'}
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              transition="all 0.15s"
              _hover={{ bg: 'gray.100', color: 'gray.700', borderColor: 'gray.200' }}
              aria-label="Why this recommendation?"
              aria-expanded={whyOpen}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setWhyOpen((s) => !s)
              }}
            >
              <FiInfo size={11} />
            </Box>
          </Flex>

          {whyOpen ? (
            <Box onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
              <WhyThisPanel
                signals={service.for_you_signals}
                service={service}
              />
            </Box>
          ) : null}

          <Text
            fontSize={isHero ? '20px' : '15px'}
            fontWeight={700}
            color="gray.900"
            lineClamp={2}
          >
            {service.title}
          </Text>

          <Flex align="center" gap={2}>
            <Avatar u={owner} size={isHero ? 28 : 22} />
            <Text fontSize="12px" color="gray.600" lineClamp={1}>
              {owner?.first_name} {owner?.last_name}
            </Text>
          </Flex>

          <Flex gap="10px" wrap="wrap" mt="2px">
            {durationLabel ? (
              <Flex align="center" gap="3px" fontSize="11px" color="gray.500" fontWeight={500}>
                <FiClock size={10} />{durationLabel}
              </Flex>
            ) : null}
            {service.schedule_type ? (
              <Flex align="center" gap="3px" fontSize="11px" color="gray.500" fontWeight={500}>
                <FiCalendar size={10} />{service.schedule_type}
              </Flex>
            ) : null}
            {area ? (
              <Flex align="center" gap="3px" fontSize="11px" color="gray.500" fontWeight={500}>
                <FiMapPin size={10} />{area}
              </Flex>
            ) : null}
            {service.type ? (
              <Flex align="center" gap="3px" fontSize="11px" color="gray.500" fontWeight={500}>
                <Box w="6px" h="6px" borderRadius="full" bg={accent} />
                {service.type}
              </Flex>
            ) : null}
          </Flex>

          <HStack gap={2} mt={1} flexWrap="wrap">
            <Box
              px="8px"
              py="2px"
              borderRadius="10px"
              fontSize="10px"
              bg={chip.bg}
              color={chip.fg}
              fontWeight={600}
            >
              {chip.label}
            </Box>
          </HStack>
        </Stack>
      </RouterLink>

      <Flex
        align="center"
        gap={2}
        p={isHero ? '10px 20px 18px' : '8px 16px 14px'}
      >
        <Box
          as="button"
          onClick={(e) => {
            const ev = e as unknown as React.MouseEvent
            if (requestPending || requested) return
            handleRequest(ev)
          }}
          aria-disabled={requestPending || requested}
          aria-label="Request handshake"
          px={isHero ? '18px' : '14px'}
          py={isHero ? '9px' : '7px'}
          borderRadius="9999px"
          bg={requested ? 'green.50' : 'green.700'}
          color={requested ? 'green.800' : 'white'}
          borderWidth={requested ? '1px' : '0'}
          borderColor="green.200"
          fontSize={isHero ? '13px' : '12px'}
          fontWeight={700}
          maxW={isHero ? '240px' : undefined}
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          gap="6px"
          style={{
            cursor: requestPending || requested ? 'default' : 'pointer',
            opacity: requestPending ? 0.7 : 1,
          }}
          _hover={
            requestPending || requested
              ? undefined
              : { bg: 'green.800' }
          }
          transition="background 0.15s, opacity 0.15s"
        >
          {requestPending ? (
            <Spinner size="xs" color={requested ? 'green.700' : 'white'} />
          ) : null}
          {requested
            ? 'Requested ✓'
            : isHero
              ? 'Request handshake'
              : 'Request'}
        </Box>
        <Flex align="center" gap="6px" ml="auto">
          <Box
            as="button"
            onClick={(e) => handleSave(e as unknown as React.MouseEvent)}
            aria-label={isSaved ? 'Unsave' : 'Save for later'}
            aria-pressed={isSaved}
            w={iconBtnSize}
            h={iconBtnSize}
            borderRadius="full"
            bg={isSaved ? '#FEF6DC' : 'gray.50'}
            color={isSaved ? '#A77C0E' : 'gray.600'}
            borderWidth="1px"
            borderColor={isSaved ? '#F5DD8E' : 'gray.200'}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            cursor={savePending ? 'default' : 'pointer'}
            transition="all 0.15s"
            _hover={savePending ? undefined : { bg: isSaved ? '#FBE9A8' : 'gray.100' }}
            style={{ opacity: savePending ? 0.7 : 1 }}
          >
            {savePending ? <Spinner size="xs" /> : <FiBookmark size={iconBtnIconSize} />}
          </Box>
          <Box
            as="button"
            onClick={(e) => handleDismiss(e as unknown as React.MouseEvent)}
            aria-label="Not interested"
            title="Not interested"
            w={iconBtnSize}
            h={iconBtnSize}
            borderRadius="full"
            bg="gray.50"
            color="gray.600"
            borderWidth="1px"
            borderColor="gray.200"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            cursor={dismissPending ? 'default' : 'pointer'}
            transition="all 0.15s"
            _hover={dismissPending ? undefined : { bg: 'red.50', color: 'red.600', borderColor: 'red.200' }}
            style={{ opacity: dismissPending ? 0.7 : 1 }}
          >
            {dismissPending ? <Spinner size="xs" /> : <FiSlash size={iconBtnIconSize} />}
          </Box>
        </Flex>
      </Flex>
    </Box>
  )
}
