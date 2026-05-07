import { Box, Flex, Text } from '@chakra-ui/react'
import { FiChevronDown, FiMapPin } from 'react-icons/fi'
import { AMBER, BLUE, GRAY200, GRAY500, GRAY700, GREEN } from '@/theme/tokens'

interface MapInfoStripProps {
  area: string | null
  offerCount: number
  needCount: number
  eventCount: number
  onExpand: () => void
}

interface DotItem {
  color: string
  count: number
  label: string
}

export function MapInfoStrip({
  area,
  offerCount,
  needCount,
  eventCount,
  onExpand,
}: MapInfoStripProps) {
  const total = offerCount + needCount + eventCount
  const items: DotItem[] = [
    { color: GREEN, count: offerCount, label: 'offers' },
    { color: BLUE, count: needCount, label: 'needs' },
    { color: AMBER, count: eventCount, label: 'events' },
  ]

  return (
    <Box
      as="button"
      onClick={onExpand}
      w="100%"
      bg="white"
      borderBottom={`1px solid ${GRAY200}`}
      px={{ base: 4, md: 6 }}
      py="9px"
      flexShrink={0}
      cursor="pointer"
      transition="background 0.15s ease"
      _hover={{ bg: 'gray.50' }}
      textAlign="left"
      aria-label="Expand map"
    >
      <Flex align="center" gap={3} fontSize="12px" color={GRAY700}>
        <Flex align="center" gap="6px" fontWeight={600} flexShrink={0}>
          <Box as={FiMapPin} color={GREEN} />
          <Text as="span" lineClamp={1} maxW="180px">
            {area || 'Your area'}
          </Text>
        </Flex>
        <Box w="1px" h="14px" bg={GRAY200} flexShrink={0} />
        <Text as="span" color={GRAY500} flexShrink={0}>
          {total} nearby
        </Text>
        <Flex align="center" gap="10px" flexShrink={0} display={{ base: 'none', sm: 'flex' }}>
          {items.map(item => (
            <Flex key={item.label} align="center" gap="5px">
              <Box w="7px" h="7px" borderRadius="full" bg={item.color} />
              <Text as="span" fontSize="11px" color={GRAY500}>
                {item.count} {item.label}
              </Text>
            </Flex>
          ))}
        </Flex>
        <Box flex={1} />
        <Flex align="center" gap="4px" color={GRAY500} flexShrink={0}>
          <Text as="span" fontSize="11px">Show map</Text>
          <Box as={FiChevronDown} />
        </Flex>
      </Flex>
    </Box>
  )
}
