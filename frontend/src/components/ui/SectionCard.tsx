import React from 'react'
import { Box, Flex } from '@chakra-ui/react'
import { GRAY200, WHITE } from '@/theme/tokens'
import EyebrowLabel from './EyebrowLabel'

type Props = {
  label?: string
  icon?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
  mb?: number | string
  overflow?: string
  h?: number | string | object
  maxH?: number | string | object
}

const SectionCard = ({ label, icon, right, children, mb = 5, overflow = 'hidden', h, maxH }: Props) => {
  return (
    <Box
      borderRadius="20px"
      border={`1px solid ${GRAY200}`}
      bg={WHITE}
      p={{ base: 4, md: 5 }}
      mb={mb}
      overflow={overflow}
      h={h}
      maxH={maxH}
    >
      {(label || right) && (
        <Flex align="center" justify="space-between" mb={label ? 4 : 0}>
          {label && <EyebrowLabel icon={icon}>{label}</EyebrowLabel>}
          {right && <Box>{right}</Box>}
        </Flex>
      )}
      {children}
    </Box>
  )
}

export default SectionCard
