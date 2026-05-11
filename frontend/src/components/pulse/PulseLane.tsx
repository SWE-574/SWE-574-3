import { Box, Flex, HStack, Stack, Text } from '@chakra-ui/react'

interface Props {
  label: string
  hint?: string
  layout?: 'vertical' | 'horizontal'
  emptyState?: React.ReactNode
  children: React.ReactNode
  childCount: number
}

export default function PulseLane({
  label,
  hint,
  layout = 'vertical',
  emptyState,
  children,
  childCount,
}: Props) {
  return (
    <Box mt={6} data-testid={`pulse-lane-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <Flex align="baseline" justify="space-between" mb={2}>
        <Text
          fontSize="11px"
          fontWeight={700}
          color="gray.500"
          textTransform="uppercase"
          letterSpacing="0.05em"
        >
          {label}
        </Text>
        {hint ? (
          <Text fontSize="11px" color="gray.500">
            {hint}
          </Text>
        ) : null}
      </Flex>
      {childCount === 0 && emptyState ? (
        emptyState
      ) : layout === 'horizontal' ? (
        <Box overflowX="auto" pb={2} css={{ scrollbarWidth: 'thin' }}>
          <HStack gap={3} align="stretch">
            {children}
          </HStack>
        </Box>
      ) : (
        <Stack gap={3}>{children}</Stack>
      )}
    </Box>
  )
}
