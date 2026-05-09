import { useEffect, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'

import { featuredAPI } from '@/services/featuredAPI'
import type { FeaturedChip } from '@/types'

interface TagChipsRowProps {
  // qid of the active chip, or null when "All" is selected.
  activeQid: string | null
  onSelect: (qid: string | null) => void
}

export default function TagChipsRow({ activeQid, onSelect }: TagChipsRowProps) {
  const [chips, setChips] = useState<FeaturedChip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    featuredAPI
      .getChips(controller.signal)
      .then(({ chips: rows }) => setChips(rows))
      .catch((err: unknown) => {
        const e = err as { name?: string; code?: string }
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return
        setChips([])
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  if (loading && chips.length === 0) {
    return null
  }

  return (
    <Flex gap={2} overflowX="auto" align="center" css={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
      <Chip label="All" active={activeQid === null} onClick={() => onSelect(null)} />
      {chips.map(chip => (
        <Chip
          key={chip.qid}
          label={chip.label}
          active={activeQid === chip.qid}
          onClick={() => onSelect(chip.qid)}
        />
      ))}
    </Flex>
  )
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Box
      as="button"
      onClick={onClick}
      flexShrink={0}
      px={3}
      py={1.5}
      borderRadius="full"
      bg={active ? 'gray.900' : 'gray.100'}
      color={active ? 'white' : 'gray.800'}
      fontSize="13px"
      fontWeight={active ? 700 : 600}
      _hover={active ? {} : { bg: 'gray.200' }}
      transition="background 0.12s"
    >
      <Text as="span" lineHeight="1" whiteSpace="nowrap">{label}</Text>
    </Box>
  )
}
