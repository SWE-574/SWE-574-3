import React from 'react'
import { Flex, Text } from '@chakra-ui/react'
import { GRAY100, GRAY700, WHITE } from '@/theme/tokens'

type Props = {
  children: React.ReactNode
  icon?: React.ReactNode
  tone?: 'dark' | 'light'
}

const EyebrowLabel = ({ children, icon, tone = 'dark' }: Props) => {
  const iconBg = tone === 'light' ? 'rgba(255,255,255,0.3)' : GRAY100
  const textColor = tone === 'light' ? 'rgba(255,255,255,0.9)' : GRAY700

  return (
    <Flex align="center" gap="8px">
      {icon && (
        <Flex
          w="32px"
          h="32px"
          borderRadius="full"
          align="center"
          justify="center"
          flexShrink={0}
          style={{ background: iconBg, color: tone === 'light' ? WHITE : GRAY700 }}
        >
          {icon}
        </Flex>
      )}
      <Text
        fontSize="11px"
        fontWeight={800}
        letterSpacing="0.16em"
        textTransform="uppercase"
        style={{ color: textColor }}
      >
        {children}
      </Text>
    </Flex>
  )
}

export default EyebrowLabel
