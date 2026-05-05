import { useEffect, useState } from 'react'
import { Box, Flex, HStack, Spinner, Text, VStack } from '@chakra-ui/react'
import { FiHeart } from 'react-icons/fi'
import { Link as RouterLink } from 'react-router-dom'

import { serviceAPI } from '@/services/serviceAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Service } from '@/types'

export default function ForYouCarousel() {
  const user = useAuthStore(state => state.user)
  // Only onboarded viewers with declared skills get a populated For You feed.
  const eligible = Boolean(user?.is_onboarded && user?.skills?.length)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(eligible)

  useEffect(() => {
    if (!eligible) return
    let cancelled = false
    serviceAPI
      .list({ sort: 'for_you' })
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
      <Flex align="center" mb={3}>
        <Box as={FiHeart} color="purple.500" />
        <Text fontSize="md" fontWeight="700" color="gray.900" ml={2}>
          For you
        </Text>
        <Text fontSize="xs" color="gray.500" ml={2}>
          Picked from your interests, follows, and recent activity
        </Text>
      </Flex>
      {loading ? (
        <Flex h="120px" align="center" justify="center">
          <Spinner size="sm" color="purple.500" />
        </Flex>
      ) : (
        <Box overflowX="auto" pb={2} css={{ scrollbarWidth: 'thin' }}>
          <HStack gap={3} align="stretch">
            {services.map(service => (
              <RouterLink
                key={service.id}
                to={`/service-detail/${service.id}?from=for_you`}
                style={{ textDecoration: 'none' }}
              >
                <VStack
                  align="start"
                  gap={1}
                  w="220px"
                  p={3}
                  borderRadius="12px"
                  bg="purple.50"
                  borderWidth="1px"
                  borderColor="purple.100"
                  _hover={{ bg: 'purple.100', cursor: 'pointer' }}
                >
                  <Text fontSize="11px" fontWeight="700" color="purple.600" textTransform="uppercase">
                    {service.type}
                  </Text>
                  <Text fontSize="sm" fontWeight="700" color="gray.900" lineClamp={2}>
                    {service.title}
                  </Text>
                  <Text fontSize="xs" color="gray.600" lineClamp={1}>
                    {service.user?.first_name} {service.user?.last_name}
                  </Text>
                </VStack>
              </RouterLink>
            ))}
          </HStack>
        </Box>
      )}
    </Box>
  )
}
