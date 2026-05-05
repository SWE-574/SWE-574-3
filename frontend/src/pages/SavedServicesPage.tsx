import { useEffect, useState } from 'react'
import { Box, Flex, Spinner, Stack, Text } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'
import { FiBookmark } from 'react-icons/fi'

import { serviceAPI } from '@/services/serviceAPI'
import type { Service } from '@/types'

export default function SavedServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    serviceAPI
      .listSaved()
      .then(rows => {
        if (!cancelled) setServices(rows)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load saved services right now.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Box maxW="640px" mx="auto" px={4} py={6}>
      <Flex align="center" mb={4} gap={2}>
        <FiBookmark />
        <Text fontSize="xl" fontWeight="800" color="gray.900">
          Saved
        </Text>
      </Flex>
      <Text fontSize="sm" color="gray.600" mb={4}>
        Services you've bookmarked privately for later.
      </Text>

      {loading ? (
        <Flex h="120px" align="center" justify="center">
          <Spinner color="purple.500" />
        </Flex>
      ) : error ? (
        <Box bg="red.50" p={3} borderRadius="md">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      ) : services.length === 0 ? (
        <Box bg="gray.50" p={6} borderRadius="md">
          <Text fontSize="sm" color="gray.600">
            Nothing saved yet. Tap the bookmark icon on any service to keep it here.
          </Text>
        </Box>
      ) : (
        <Stack gap={2}>
          {services.map(service => (
            <RouterLink
              key={service.id}
              to={`/service-detail/${service.id}`}
              style={{ textDecoration: 'none' }}
            >
              <Flex
                align="center"
                gap={3}
                p={3}
                borderRadius="lg"
                bg="white"
                borderWidth="1px"
                borderColor="gray.200"
                _hover={{ bg: 'gray.50', cursor: 'pointer' }}
              >
                <Box flex="1">
                  <Text fontSize="11px" fontWeight="700" color="purple.600" textTransform="uppercase">
                    {service.type}
                  </Text>
                  <Text fontSize="sm" fontWeight="700" color="gray.900" lineClamp={2}>
                    {service.title}
                  </Text>
                  <Text fontSize="xs" color="gray.500" lineClamp={1}>
                    {service.user?.first_name} {service.user?.last_name}
                  </Text>
                </Box>
              </Flex>
            </RouterLink>
          ))}
        </Stack>
      )}
    </Box>
  )
}
