import { Box, Flex } from '@chakra-ui/react'
import { AMBER, BLUE, GRAY700, GREEN } from '@/theme/tokens'

const ITEMS: Array<{ color: string; label: string }> = [
  { color: GREEN, label: 'Offers' },
  { color: BLUE, label: 'Wants' },
  { color: AMBER, label: 'Events' },
]

export function MapLegendOverlay() {
  return (
    <Box
      position="absolute"
      bottom="12px"
      left="12px"
      px="12px"
      py="6px"
      borderRadius="999px"
      bg="rgba(255, 255, 255, 0.96)"
      borderWidth="1px"
      borderColor="rgba(255, 255, 255, 0.6)"
      boxShadow="0 2px 8px rgba(0, 0, 0, 0.10)"
      style={{ backdropFilter: 'blur(8px)' }}
      zIndex={1}
      pointerEvents="none"
    >
      <Flex align="center" gap="12px" fontSize="11px" fontWeight={600} color={GRAY700}>
        {ITEMS.map(item => (
          <Flex key={item.label} align="center" gap="5px">
            <Box w="8px" h="8px" borderRadius="full" bg={item.color} />
            {item.label}
          </Flex>
        ))}
      </Flex>
    </Box>
  )
}

export function MapRefreshBadge() {
  return (
    <Box
      position="absolute"
      bottom="12px"
      right="12px"
      px="10px"
      py="5px"
      borderRadius="999px"
      bg="rgba(255, 255, 255, 0.96)"
      borderWidth="1px"
      borderColor="rgba(255, 255, 255, 0.6)"
      boxShadow="0 2px 8px rgba(0, 0, 0, 0.10)"
      style={{ backdropFilter: 'blur(8px)' }}
      zIndex={1}
    >
      <Flex align="center" gap="6px" fontSize="11px" fontWeight={500} color={GRAY700}>
        <Box
          as="span"
          w="10px"
          h="10px"
          borderRadius="full"
          borderWidth="2px"
          borderColor="gray.300"
          borderTopColor="gray.600"
          style={{ animation: 'spin 0.9s linear infinite' }}
        />
        Refreshing
      </Flex>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Box>
  )
}
