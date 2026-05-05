import { Box, Flex, Text } from '@chakra-ui/react'
import { FiClock, FiMapPin, FiCalendar } from 'react-icons/fi'
import type { Service } from '@/types'
import {
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  GRAY100, GRAY500, GRAY800,
} from '@/theme/tokens'

const fmtDur = (d: number | string) => `${Number(d)}h`

// ── Shared service mini card ──────────────────────────────────────────────────
// Used by UserProfile and PublicProfile.
// showStatus: show the status badge (Active / Inactive). Default true.
// showSchedule: show the schedule_type badge. Default true.
export function ServiceCard({
  service,
  onNav,
  showStatus = true,
  showSchedule = true,
}: {
  service: Service
  onNav: () => void
  showStatus?: boolean
  showSchedule?: boolean
}) {
  const isOffer = service.type === 'Offer'
  const isNeed  = service.type === 'Need'
  const typeColor = isOffer ? GREEN : isNeed ? BLUE : AMBER
  const typeBg    = isOffer ? GREEN_LT : isNeed ? BLUE_LT : AMBER_LT
  const cardBg    = isOffer ? `${GREEN}08` : isNeed ? `${BLUE}08` : `${AMBER}08`
  const borderCol = isOffer ? `${GREEN}30` : isNeed ? `${BLUE}30` : `${AMBER}30`
  return (
    <Box
      border={`1px solid ${borderCol}`}
      borderRadius="12px"
      p="12px 14px"
      bg={cardBg}
      onClick={onNav}
      style={{ cursor: 'pointer', transition: 'background 0.12s, box-shadow 0.12s' }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLElement).style.background = isOffer ? `${GREEN}14` : isNeed ? `${BLUE}14` : `${AMBER}14`
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.07)'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLElement).style.background = cardBg
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}
    >
      <Flex align="center" justify="space-between" mb="8px">
        <Box px="7px" py="2px" borderRadius="6px" fontSize="10px" fontWeight={700} style={{ background: typeBg, color: typeColor }}>
          {service.type}
        </Box>
        {showStatus && (
          <Box px="7px" py="2px" borderRadius="6px" fontSize="10px" fontWeight={500}
            style={{ background: service.status === 'Active' ? GREEN_LT : GRAY100, color: service.status === 'Active' ? GREEN : GRAY500 }}>
            {service.status}
          </Box>
        )}
      </Flex>
      <Text
        fontSize="14px"
        fontWeight={700}
        color={GRAY800}
        mb="5px"
        lineHeight={1.3}
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {service.title}
      </Text>
      {service.description && (
        <Text
          fontSize="12px"
          color={GRAY500}
          mb="8px"
          lineHeight={1.5}
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {service.description}
        </Text>
      )}
      <Flex gap="10px" wrap="wrap" mt="auto">
        <Flex align="center" gap="3px" fontSize="11px" color={GRAY500} fontWeight={500}>
          <FiClock size={10} />{fmtDur(service.duration)}
        </Flex>
        {service.location_type && (
          <Flex align="center" gap="3px" fontSize="11px" color={GRAY500} fontWeight={500}>
            <FiMapPin size={10} />{service.location_area || service.location_type}
          </Flex>
        )}
        {showSchedule && service.schedule_type && (
          <Flex align="center" gap="3px" fontSize="11px" color={GRAY500} fontWeight={500}>
            <FiCalendar size={10} />{service.schedule_type}
          </Flex>
        )}
      </Flex>
    </Box>
  )
}

export default ServiceCard
