import React from 'react'
import { Box } from '@chakra-ui/react'

type Props = {
  gradient: string
  children: React.ReactNode
  mb?: number | string
  mt?: number | string
  p?: number | string | object
  borderRadius?: string
  boxShadow?: string
}

const HeroSurface = ({ gradient, children, mb, mt, p, borderRadius, boxShadow }: Props) => {
  return (
    <Box
      position="relative"
      overflow="hidden"
      borderRadius={borderRadius ?? '22px'}
      boxShadow={boxShadow ?? '0 14px 38px rgba(17,24,39,0.18)'}
      backgroundImage={gradient}
      color="white"
      mb={mb}
      mt={mt}
      p={p ?? { base: 5, md: 6 }}
    >
      {/* Top-right decorative blob */}
      <Box
        position="absolute"
        top="-60px"
        right="-60px"
        w="260px"
        h="260px"
        borderRadius="full"
        style={{
          background: 'rgba(255,255,255,0.2)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }}
      />
      {/* Bottom-left decorative blob */}
      <Box
        position="absolute"
        bottom="-70px"
        left="-50px"
        w="220px"
        h="220px"
        borderRadius="full"
        style={{
          background: 'rgba(255,255,255,0.1)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }}
      />
      {/* Content sits above the blobs */}
      <Box position="relative" style={{ zIndex: 1 }}>
        {children}
      </Box>
    </Box>
  )
}

export default HeroSurface
