import { useEffect, useState } from 'react'
import { Box, Flex, HStack, Skeleton, Stack, Text } from '@chakra-ui/react'
import { FiHeart } from 'react-icons/fi'
import { Link as RouterLink, useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { serviceAPI } from '@/services/serviceAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Service } from '@/types'
import { chipForSignals, diversifyByChip } from '@/utils/forYouChips'

const CARD_WIDTH = 240
const IMAGE_HEIGHT = 120

const TYPE_GRADIENT: Record<Service['type'], string> = {
  Offer: 'linear-gradient(135deg, #16a34a 0%, #166534 100%)',
  Need: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  Event: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
}

function ForYouCard({ service }: { service: Service }) {
  const chip = chipForSignals(service.for_you_signals)
  const heroImage = service.media?.[0]?.file_url
  const heroBg = heroImage
    ? `url(${heroImage}) center/cover no-repeat`
    : TYPE_GRADIENT[service.type]
  const owner = service.user
  const area = service.location_area || service.location_type

  return (
    <RouterLink
      to={`/service-detail/${service.id}?from=for_you`}
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
          borderColor: 'purple.200',
          boxShadow: '0 12px 24px rgba(168, 85, 247, 0.15)',
        }}
      >
        <Box position="relative" h={`${IMAGE_HEIGHT}px`} style={{ background: heroBg }}>
          {/* Bottom-up gradient scrim so the title stays readable on any image */}
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

function ForYouSkeletonCard() {
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

function ForYouEmptyState() {
  const navigate = useNavigate()
  return (
    <Box
      bg="purple.50"
      borderRadius="14px"
      borderWidth="1px"
      borderColor="purple.100"
      p={5}
      display="flex"
      flexDirection="column"
      gap={3}
      alignItems="flex-start"
    >
      <Text fontSize="sm" color="gray.700">
        Your For You feed is quiet today. Add more interests to widen it.
      </Text>
      <Box
        as="button"
        onClick={() => navigate('/onboarding')}
        px="14px"
        py="7px"
        borderRadius="9px"
        bg="purple.500"
        color="white"
        fontSize="12px"
        fontWeight={700}
        _hover={{ bg: 'purple.600' }}
        cursor="pointer"
      >
        Edit interests
      </Box>
    </Box>
  )
}

export default function ForYouCarousel() {
  const user = useAuthStore(state => state.user)
  const eligible = Boolean(user?.is_onboarded && user?.skills?.length)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(eligible)

  useEffect(() => {
    if (!eligible) return
    let cancelled = false
    serviceAPI
      .list({ sort: 'for_you' })
      .then(results => {
        if (!cancelled) setServices(diversifyByChip(results))
      })
      .catch(err => {
        console.error('ForYouCarousel: failed to load For You feed', err)
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

  const headerName = user?.first_name?.trim()
  const headerTitle = headerName ? `For ${headerName}` : 'For you'

  return (
    <Box mb={6}>
      <Flex align="center" mb={3} gap={2}>
        <Box as={FiHeart} color="purple.500" />
        <Text fontSize="md" fontWeight={700} color="gray.900">
          {headerTitle}
        </Text>
        <Text fontSize="xs" color="gray.500">
          Picked from your interests, follows, and recent activity
        </Text>
      </Flex>
      {loading ? (
        <Box overflowX="auto" pb={2} css={{ scrollbarWidth: 'thin' }}>
          <HStack gap={3} align="stretch">
            <ForYouSkeletonCard />
            <ForYouSkeletonCard />
            <ForYouSkeletonCard />
          </HStack>
        </Box>
      ) : services.length === 0 ? (
        <ForYouEmptyState />
      ) : (
        <Box overflowX="auto" pb={2} css={{ scrollbarWidth: 'thin' }}>
          <HStack gap={3} align="stretch">
            {services.map(service => (
              <ForYouCard key={service.id} service={service} />
            ))}
          </HStack>
        </Box>
      )}
    </Box>
  )
}
