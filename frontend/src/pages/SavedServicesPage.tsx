import { useEffect, useState } from 'react'
import { Box, Flex, Grid, Spinner, Stack, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import { FiBookmark } from 'react-icons/fi'

import { serviceAPI } from '@/services/serviceAPI'
import RecommendationCard from '@/components/pulse/RecommendationCard'
import { GREEN, GREEN_LT, GRAY200, WHITE } from '@/theme/tokens'
import type { Service } from '@/types'

export default function SavedServicesPage() {
  const navigate = useNavigate()
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
      .catch((err) => {
        console.error('SavedServicesPage: load failed', err)
        if (!cancelled) setError('Could not load saved services right now.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleDismissed = (serviceId: string) => {
    setServices((cur) => cur.filter((s) => s.id !== serviceId))
  }

  return (
    <Box minH="100vh" bg="gray.50">
      <Box maxW="1080px" mx="auto" px={{ base: 4, md: 6 }} py={{ base: 5, md: 8 }}>
        <Flex align="center" gap={3} mb="6px">
          <Flex
            w="40px" h="40px"
            borderRadius="12px"
            bg={GREEN_LT}
            color={GREEN}
            align="center"
            justify="center"
          >
            <FiBookmark size={18} />
          </Flex>
          <Text fontSize="2xl" fontWeight={800} color="gray.900">
            Saved
          </Text>
        </Flex>
        <Text fontSize="sm" color="gray.600" mb={6}>
          Your bookmarked services. Tap the bookmark icon on any card to remove it.
        </Text>

        {loading ? (
          <Flex h="160px" align="center" justify="center">
            <Spinner color={GREEN} size="lg" />
          </Flex>
        ) : error ? (
          <Box bg="red.50" p={4} borderRadius="md" borderWidth="1px" borderColor="red.100">
            <Text fontSize="sm" color="red.700">{error}</Text>
          </Box>
        ) : services.length === 0 ? (
          <Stack
            bg={WHITE}
            borderWidth="1px"
            borderColor={GRAY200}
            borderRadius="14px"
            p={8}
            align="center"
            gap={3}
          >
            <Box as={FiBookmark} fontSize="32px" color="gray.400" />
            <Text fontSize="sm" color="gray.600" textAlign="center" maxW="360px">
              Nothing saved yet. Tap the bookmark icon on any service to keep it here for later.
            </Text>
            <Box
              as="button"
              onClick={() => navigate('/dashboard')}
              px={5} py="9px"
              borderRadius="9999px"
              bg={GREEN} color={WHITE}
              fontSize="13px" fontWeight={700}
              cursor="pointer"
              _hover={{ opacity: 0.9 }}
              transition="opacity 0.15s"
            >
              Browse services
            </Box>
          </Stack>
        ) : (
          <Grid
            templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
            gap={3}
          >
            {services.map((service) => (
              <RecommendationCard
                key={service.id}
                service={service}
                lane="for_you"
                onDismissed={handleDismissed}
              />
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  )
}
