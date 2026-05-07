import { Box, Flex, Text } from '@chakra-ui/react'
import { FiCalendar } from 'react-icons/fi'

interface ActivityDayHeaderProps {
  label: string
  count: number
}

const ACCENTS: Record<string, { bg: string; fg: string; dot: string }> = {
  Today: { bg: 'rgba(168, 85, 247, 0.1)', fg: '#7e22ce', dot: '#a855f7' },
  Yesterday: { bg: 'rgba(59, 130, 246, 0.08)', fg: '#1d4ed8', dot: '#3b82f6' },
}

const DEFAULT_ACCENT = { bg: 'rgba(107, 114, 128, 0.08)', fg: '#374151', dot: '#9ca3af' }

export function ActivityDayHeader({ label, count }: ActivityDayHeaderProps) {
  const accent = ACCENTS[label] ?? DEFAULT_ACCENT
  return (
    <Flex
      align="center"
      gap={3}
      mt={6}
      mb={4}
      position="sticky"
      top="-1px"
      zIndex={2}
      py="4px"
      style={{ backdropFilter: 'blur(6px)' }}
    >
      <Flex
        align="center"
        gap="8px"
        px="14px"
        py="6px"
        borderRadius="999px"
        bg={accent.bg}
        color={accent.fg}
        fontSize="12px"
        fontWeight={700}
        boxShadow="0 1px 2px rgba(0,0,0,0.04)"
        borderWidth="1px"
        borderColor="rgba(255,255,255,0.6)"
      >
        <Box as={FiCalendar} fontSize="13px" />
        <Text as="span">{label}</Text>
        <Box w="1px" h="11px" bg="currentColor" opacity={0.25} />
        <Text as="span" fontSize="11px" fontWeight={600}>
          {count} {count === 1 ? 'event' : 'events'}
        </Text>
      </Flex>
      <Box flex={1} h="1px" bg="gray.200" opacity={0.7} />
    </Flex>
  )
}
