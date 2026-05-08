import { Box, Flex, Spinner, Text } from '@chakra-ui/react'
import { FiX } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'

import { MapView } from '@/components/MapView'
import {
  GRAY100, GRAY200, GRAY500, GRAY700, GRAY900, GREEN, WHITE,
} from '@/theme/tokens'
import type { Service } from '@/types'

interface BigMapModalProps {
  isOpen: boolean
  onClose: () => void
  services: Service[]
  loading: boolean
  userLocation: { lat: number; lng: number } | null
}

export default function BigMapModal({
  isOpen,
  onClose,
  services,
  loading,
  userLocation,
}: BigMapModalProps) {
  const navigate = useNavigate()
  if (!isOpen) return null

  const pinCount = services.length

  return (
    <Box position="fixed" inset="0" zIndex={1400}>
      <Box position="absolute" inset="0" bg="rgba(15,23,42,0.48)" onClick={onClose} />
      <Flex position="relative" h="100%" align="center" justify="center" p={4}>
        <Box
          w="100%"
          maxW="1100px"
          h="92vh"
          maxH="92vh"
          overflow="hidden"
          borderRadius="20px"
          bg={WHITE}
          border={`1px solid ${GRAY200}`}
          boxShadow="0 24px 64px rgba(15,23,42,0.24)"
          display="flex"
          flexDirection="column"
        >
          <Flex px={5} py={4} align="center" justify="space-between" gap={4} borderBottom={`1px solid ${GRAY100}`} flexShrink={0}>
            <Box>
              <Text fontSize="18px" fontWeight={800} color={GRAY900}>Browse on map</Text>
              <Text mt="2px" fontSize="12px" color={GRAY500}>
                {loading ? 'Loading services…' : `${pinCount} service${pinCount !== 1 ? 's' : ''} on the map`}
              </Text>
            </Box>
            <Box
              as="button"
              onClick={onClose}
              w="36px"
              h="36px"
              borderRadius="10px"
              bg={GRAY100}
              color={GRAY700}
              border={`1px solid ${GRAY200}`}
              style={{ cursor: 'pointer' }}
              aria-label="Close map"
            >
              <Flex align="center" justify="center" h="100%">
                <FiX size={16} />
              </Flex>
            </Box>
          </Flex>

          <Box flex={1} minH={0} position="relative">
            {loading ? (
              <Flex h="100%" align="center" justify="center">
                <Spinner color={GREEN} size="lg" />
              </Flex>
            ) : (
              <MapView
                services={services}
                height="100%"
                userLocation={userLocation}
                onServiceClick={(id) => {
                  onClose()
                  navigate(`/service-detail/${id}`)
                }}
              />
            )}
          </Box>
        </Box>
      </Flex>
    </Box>
  )
}
