import { Box, HStack, Text } from '@chakra-ui/react'

export type ActivityFilter = 'all' | 'following' | 'nearby' | 'recent'

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'following', label: 'Following' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'recent', label: 'Last 24h' },
]

interface ActivityFilterChipsProps {
  active: ActivityFilter
  counts: Record<ActivityFilter, number>
  onChange: (filter: ActivityFilter) => void
}

export function ActivityFilterChips({ active, counts, onChange }: ActivityFilterChipsProps) {
  return (
    <HStack gap={2} mb={5} wrap="wrap">
      {FILTERS.map(f => {
        const isActive = f.id === active
        const count = counts[f.id] ?? 0
        return (
          <Box
            key={f.id}
            as="button"
            onClick={() => onChange(f.id)}
            px="14px"
            py="7px"
            borderRadius="999px"
            fontSize="13px"
            fontWeight={isActive ? 700 : 500}
            bg={isActive ? 'gray.900' : 'white'}
            color={isActive ? 'white' : 'gray.700'}
            borderWidth="1px"
            borderColor={isActive ? 'gray.900' : 'gray.200'}
            cursor="pointer"
            transition="all 0.15s ease"
            display="inline-flex"
            alignItems="center"
            gap="6px"
            _hover={{ borderColor: isActive ? 'gray.900' : 'gray.400' }}
          >
            {f.label}
            <Text
              as="span"
              fontSize="11px"
              fontWeight={600}
              color={isActive ? 'whiteAlpha.700' : 'gray.500'}
            >
              {count}
            </Text>
          </Box>
        )
      })}
    </HStack>
  )
}
