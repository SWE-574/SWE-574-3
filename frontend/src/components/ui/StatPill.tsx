import React from 'react'
import { Flex, Text } from '@chakra-ui/react'
import { GRAY100, GRAY700, GRAY500 } from '@/theme/tokens'

type Props = {
  icon?: React.ReactNode
  label: string
  value: string | number
  tone?: 'gradient' | 'light'
}

const StatPill = ({ icon, label, value, tone = 'light' }: Props) => {
  const bg = tone === 'gradient' ? 'rgba(255,255,255,0.25)' : GRAY100
  const valueColor = tone === 'gradient' ? 'rgba(255,255,255,0.95)' : GRAY700
  const labelColor = tone === 'gradient' ? 'rgba(255,255,255,0.7)' : GRAY500

  return (
    <Flex
      align="center"
      gap="6px"
      px="10px"
      py="5px"
      borderRadius="999px"
      style={{ background: bg }}
    >
      {icon && (
        <Flex align="center" style={{ color: tone === 'gradient' ? 'rgba(255,255,255,0.8)' : GRAY500 }}>
          {icon}
        </Flex>
      )}
      <Text fontSize="13px" fontWeight={800} style={{ color: valueColor }}>
        {value}
      </Text>
      <Text fontSize="11px" fontWeight={600} textTransform="uppercase" letterSpacing="0.06em" style={{ color: labelColor }}>
        {label}
      </Text>
    </Flex>
  )
}

export default StatPill
