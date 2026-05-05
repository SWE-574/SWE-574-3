import { useEffect, useState } from 'react'
import { Box, Flex, HStack, Skeleton, Stack, Text } from '@chakra-ui/react'
import { FiCompass } from 'react-icons/fi'
import { Link as RouterLink } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { serviceAPI } from '@/services/serviceAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Service } from '@/types'

const CARD_WIDTH = 240
const IMAGE_HEIGHT = 120

const TYPE_GRADIENT: Record<Service['type'], string> = {
  Offer: 'linear-gradient(135deg, #16a34a 0%, #166534 100%)',
  Need: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  Event: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
}

interface PoolChip {
  label: string
  bg: string
  fg: string
}

const POOL_CHIPS: Record<NonNullable<Service['explore_pool']>, PoolChip> = {
  cold_start: { label: 'Fresh face', bg: 'rgba(234, 179, 8, 0.95)', fg: 'white' },
  undershown_quality: { label: 'Quiet gem', bg: 'rgba(20, 184, 166, 0.95)', fg: 'white' },
  stale_recurring: { label: 'Worth another look', bg: 'rgba(244, 63, 94, 0.95)', fg: 'white' },
}

const DEFAULT_CHIP: PoolChip = { label: 'Discover', bg: 'rgba(107, 114, 128, 0.95)', fg: 'white' }

function chipForPool(pool?: Service['explore_pool']): PoolChip {
  if (!pool) return DEFAULT_CHIP
  return POOL_CHIPS[pool] ?? DEFAULT_CHIP
}

function ExploreCard({ service }: { service: Service }) {
  const chip = chipForPool(service.explore_pool)
  const heroImage = service.media?.[0]?.file_url
  const heroBg = heroImage
    ? `url(${heroImage}) center/cover no-repeat`
    : TYPE_GRADIENT[service.type]
  const owner = service.user
  const area = service.location_area || service.location_type

  return (
    <RouterLink
      to={`/service-detail/${service.id}?from=explore`}
      style={{ textDecoration: 'none', flexShrink: 0 }}
    >
      <Box
        w={`${CARD_WIDTH}px`}
        bg="white"
        borderRadius="14px"
        borderWidth="1px"
        borderColor="gray.200"
        overflow="hidden"
        transition="all 0.18s ease"
        _hover={{
          transform: 'translateY(-2px)',
          borderColor: 'teal.200',
          boxShadow: '0 12px 24px rgba(20, 184, 166, 0.18)',
        }}
      >
        <Box position="relative" h={`${IMAGE_HEIGHT}px`} style={{ background: heroBg }}>
          <Box
            position="absolute"
            inset={0}
            background="linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)"
          />
          <Box
            position="absolute"
            top="8px"
            left="8px"
            px="8px"
            py="3px"
            borderRadius="999px"
            fontSize="10px"
            fontWeight={700}
            textTransform="uppercase"
            letterSpacing="0.4px"
            bg={chip.bg}
            color={chip.fg}
            zIndex={1}
            boxShadow="0 1px 3px rgba(0,0,0,0.2)"
          >
            {chip.label}
          </Box>
          <Text
            position="absolute"
            bottom="10px"
            left="12px"
            right="12px"
            color="white"
            fontSize="13px"
            fontWeight={700}
            lineHeight={1.25}
            zIndex={1}
            lineClamp={2}
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            {service.title}
          </Text>
        </Box>
        <Flex align="center" gap={2} p="10px 12px 12px">
          <Avatar u={owner} size={24} />
          <Stack gap={0} minW={0} flex={1}>
            <Text fontSize="12px" fontWeight={600} color="gray.900" lineClamp={1}>
              {owner?.first_name} {owner?.last_name}
            </Text>
            <Text fontSize="10px" color="gray.500" lineClamp={1}>
              {service.type}{area ? ` · ${area}` : ''}
            </Text>
          </Stack>
        </Flex>
      </Box>
    </RouterLink>
  )
}

function ExploreSkeletonCard() {
  return (
    <Box
      w={`${CARD_WIDTH}px`}
      flexShrink={0}
      bg="white"
      borderRadius="14px"
      borderWidth="1px"
      borderColor="gray.200"
      overflow="hidden"
    >
      <Skeleton h={`${IMAGE_HEIGHT}px`} />
      <Flex align="center" gap={2} p="10px 12px 12px">
        <Skeleton boxSize="24px" borderRadius="full" />
        <Stack gap={1} flex={1}>
          <Skeleton h="12px" w="60%" />
          <Skeleton h="10px" w="40%" />
        </Stack>
      </Flex>
    </Box>
  )
}

export default function ExploreCarousel() {
  const user = useAuthStore(state => state.user)
  const eligible = Boolean(user)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(eligible)

  useEffect(() => {
    if (!eligible) return
    let cancelled = false
    serviceAPI
      .list({ explore_only: true, page_size: 10 })
      .then(results => {
        if (!cancelled) setServices(results)
      })
      .catch(() => {
        if (!cancelled) setServices([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [eligible])

  if (!eligible) return null
  if (!loading && services.length === 0) return null

  return (
    <Box mb={6}>
      <Flex align="center" mb={3} gap={2}>
        <Box as={FiCompass} color="teal.500" />
        <Text fontSize="md" fontWeight={700} color="gray.900">
          Try something new
        </Text>
        <Text fontSize="xs" color="gray.500">
          Hand-picked finds we think deserve more attention
        </Text>
      </Flex>
      {loading ? (
        <Box overflowX="auto" pb={2} css={{ scrollbarWidth: 'thin' }}>
          <HStack gap={3} align="stretch">
            <ExploreSkeletonCard />
            <ExploreSkeletonCard />
            <ExploreSkeletonCard />
          </HStack>
        </Box>
      ) : (
        <Box overflowX="auto" pb={2} css={{ scrollbarWidth: 'thin' }}>
          <HStack gap={3} align="stretch">
            {services.map(service => (
              <ExploreCard key={service.id} service={service} />
            ))}
          </HStack>
        </Box>
      )}
    </Box>
  )
}
