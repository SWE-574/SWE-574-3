import { useState } from 'react'
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Stack,
  Text,
  type BoxProps,
} from '@chakra-ui/react'
import {
  FiBookmark,
  FiCheckCircle,
  FiMoreHorizontal,
  FiThumbsUp,
} from 'react-icons/fi'
import { Link as RouterLink, useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { pulseAPI } from '@/services/pulseAPI'
import { serviceAPI } from '@/services/serviceAPI'
import type { Service } from '@/types'
import { chipForSignals } from '@/utils/forYouChips'

export type PulseLane =
  | 'hero'
  | 'for_you'
  | 'worth_a_look'
  | 'nearby'

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
}

const SOURCE_ACCENT: Record<PulseLane, string> = {
  hero: 'linear-gradient(135deg, #7a3bf0 0%, #0a8888 100%)',
  for_you: '#7a3bf0',
  worth_a_look: '#0a8050',
  nearby: '#2563eb',
}

function matchPercent(s: Service): number | null {
  const sig = s.for_you_signals
  if (!sig) return null
  const raw = sig.tag * 0.5 + sig.follow * 0.3 + sig.cooccur * 0.2
  if (raw <= 0) return null
  // Map raw blend (~0..1) to a friendly percent. Cap at 99.
  return Math.min(99, Math.round(raw * 100))
}

function explorePoolLabel(pool: Service['explore_pool']): string | null {
  if (pool === 'cold_start') return 'Fresh provider'
  if (pool === 'undershown_quality') return 'Hidden gem'
  if (pool === 'stale_recurring') return 'Rediscovered'
  return null
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
  const [isEndorsed, setIsEndorsed] = useState(Boolean(service.is_endorsed))
  const [endorsePending, setEndorsePending] = useState(false)
  const [requestPending, setRequestPending] = useState(false)
  const [requested, setRequested] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const chip = chipForSignals(service.for_you_signals)
  const pct = matchPercent(service)
  const exploreLabel = explorePoolLabel(service.explore_pool)
  const owner = service.user
  const area = service.location_area || service.location_type
  const sourceLabel = SOURCE_LABEL[lane]
  const accent = SOURCE_ACCENT[lane]
  const isHero = variant === 'hero'

  const detailHref = `/service-detail/${service.id}?from=pulse_${lane}`

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

  const handleEndorse = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (endorsePending) return
    const next = !isEndorsed
    setIsEndorsed(next)
    setEndorsePending(true)
    try {
      await serviceAPI.setEndorsed(service.id, next)
    } catch (err) {
      setIsEndorsed(!next)
      console.error('RecommendationCard: endorse failed', err)
    } finally {
      setEndorsePending(false)
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
      // Fall back to opening the detail page so the user can request manually.
      navigate(detailHref)
    } finally {
      setRequestPending(false)
    }
  }

  const handleDismiss = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen(false)
    try {
      await pulseAPI.setDismissed(service.id, true)
      onDismissed?.(service.id)
    } catch (err) {
      console.error('RecommendationCard: dismiss failed', err)
    }
  }

  const cardProps: BoxProps = {
    bg: 'white',
    borderRadius: isHero ? '18px' : '14px',
    borderWidth: isHero ? '0' : '1px',
    borderColor: 'gray.200',
    overflow: 'hidden',
    transition: 'all 0.18s ease',
    _hover: {
      transform: 'translateY(-2px)',
      borderColor: 'purple.200',
      boxShadow: '0 12px 24px rgba(124, 58, 237, 0.12)',
    },
  }

  return (
    <Box position="relative" {...cardProps} data-testid="recommendation-card">
      <Box
        height={isHero ? '6px' : '4px'}
        background={accent}
      />

      <RouterLink to={detailHref} style={{ textDecoration: 'none' }}>
        <Stack p={isHero ? '18px 20px 6px' : '14px 16px 4px'} gap={2}>
          <Flex align="center" gap={2} flexWrap="wrap">
            <Box
              px="8px"
              py="2px"
              borderRadius="999px"
              fontSize="10px"
              fontWeight={700}
              textTransform="uppercase"
              letterSpacing="0.4px"
              bg={lane === 'hero' ? 'purple.50' : 'gray.50'}
              color={lane === 'hero' ? 'purple.700' : 'gray.700'}
              borderWidth="1px"
              borderColor={lane === 'hero' ? 'purple.200' : 'gray.200'}
            >
              ★ {sourceLabel}
              {pct ? ` · ${pct}%` : ''}
            </Box>
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
          </Flex>

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
              {area ? ` · ${area}` : ''}
              {service.type ? ` · ${service.type}` : ''}
            </Text>
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
        p={isHero ? '8px 20px 18px' : '8px 16px 14px'}
      >
        <Button
          size={isHero ? 'md' : 'sm'}
          colorPalette="teal"
          flex={1}
          onClick={handleRequest}
          loading={requestPending}
          disabled={requested}
          aria-label="Request handshake"
        >
          {requested ? 'Requested ✓' : 'Request handshake'}
        </Button>
        <IconButton
          size={isHero ? 'md' : 'sm'}
          variant={isSaved ? 'solid' : 'outline'}
          colorPalette={isSaved ? 'purple' : 'gray'}
          aria-label={isSaved ? 'Unsave' : 'Save for later'}
          onClick={handleSave}
          loading={savePending}
        >
          <FiBookmark />
        </IconButton>
        {service.is_endorsable ? (
          <IconButton
            size={isHero ? 'md' : 'sm'}
            variant={isEndorsed ? 'solid' : 'outline'}
            colorPalette={isEndorsed ? 'green' : 'gray'}
            aria-label={isEndorsed ? 'Remove endorsement' : 'Endorse'}
            onClick={handleEndorse}
            loading={endorsePending}
          >
            {isEndorsed ? <FiCheckCircle /> : <FiThumbsUp />}
          </IconButton>
        ) : null}
        <Box position="relative">
          <IconButton
            size={isHero ? 'md' : 'sm'}
            variant="ghost"
            aria-label="More options"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenuOpen((s) => !s)
            }}
          >
            <FiMoreHorizontal />
          </IconButton>
          {menuOpen ? (
            <Box
              position="absolute"
              right={0}
              top="100%"
              mt={1}
              bg="white"
              borderWidth="1px"
              borderColor="gray.200"
              borderRadius="md"
              boxShadow="0 8px 24px rgba(0,0,0,0.08)"
              zIndex={10}
              minW="180px"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <Box
                as="button"
                width="100%"
                textAlign="left"
                p="10px 12px"
                fontSize="13px"
                color="gray.800"
                _hover={{ bg: 'gray.50' }}
                onClick={handleDismiss}
              >
                Not interested
              </Box>
            </Box>
          ) : null}
        </Box>
      </Flex>
    </Box>
  )
}
