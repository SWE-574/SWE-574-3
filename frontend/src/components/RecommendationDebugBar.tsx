import { Suspense, lazy, useEffect, useState } from 'react'
import { Box, Button, Flex, Portal, Spinner, Text } from '@chakra-ui/react'
import { FiCode, FiX } from 'react-icons/fi'

import type { Service } from '@/types'

const STORAGE_KEY = 'dashboard-recommendation-debug-open'
const RecommendationDebugPanel = lazy(() => import('@/components/RecommendationDebugPanel'))

export default function RecommendationDebugBar({
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
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  })
  const [shouldLoadPanel, setShouldLoadPanel] = useState(isOpen)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, String(isOpen))
    if (isOpen) setShouldLoadPanel(true)
  }, [isOpen])

  return (
    <Portal>
      <Box position="fixed" left={{ base: 4, md: 6 }} bottom={{ base: 4, md: 6 }} zIndex={1400}>
        {isOpen && shouldLoadPanel ? (
          <Suspense
            fallback={(
              <Box
                mb={3}
                w={{ base: 'calc(100vw - 32px)', md: '420px' }}
                maxW="420px"
                p={4}
                borderRadius="26px"
                border="1px solid"
                borderColor="orange.100"
                bg="linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.97) 100%)"
                backdropFilter="blur(16px)"
                boxShadow="0 22px 60px rgba(15, 23, 42, 0.16)"
              >
                <Flex align="center" justify="center" minH="180px">
                  <Spinner color="orange.500" />
                </Flex>
              </Box>
            )}
          >
            <RecommendationDebugPanel
              services={services}
              hoveredServiceId={hoveredServiceId}
              activeFilter={activeFilter}
              search={search}
              lat={lat}
              lng={lng}
              distance={distance}
            />
          </Suspense>
        ) : null}

        <Button
          size="sm"
          bg={isOpen ? 'orange.500' : 'gray.900'}
          color="white"
          borderRadius="full"
          boxShadow="0 14px 40px rgba(15, 23, 42, 0.22)"
          onClick={() => setIsOpen(value => !value)}
        >
          <Flex align="center" gap={2}>
            <FiCode size={14} />
            <Text fontSize="xs" fontWeight="800">{isOpen ? 'Debug on' : 'Debug off'}</Text>
            {isOpen ? <FiX size={12} /> : null}
          </Flex>
        </Button>
      </Box>
    </Portal>
  )
}
