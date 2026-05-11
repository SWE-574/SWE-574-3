import { Box, Flex, Stack, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'
import {
  FiActivity,
  FiBookmark,
  FiCheck,
  FiEdit3,
  FiMapPin,
  FiStar,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi'

import type { PulseStats as PulseStatsType } from '@/services/pulseAPI'
import {
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  GREEN, GREEN_LT,
  GRAY100, GRAY200, GRAY400, GRAY500, GRAY700, GRAY800,
  WHITE, YELLOW,
} from '@/theme/tokens'

export type PulseLaneKey =
  | 'for_you'
  | 'worth_a_look'
  | 'nearby'
  | 'follows'
  | 'events'
  | 'people'
  | 'help_others'

interface Props {
  stats: PulseStatsType | null
  visibleLanes: Set<PulseLaneKey>
  onToggleLane: (lane: PulseLaneKey) => void
  onOpenMap?: () => void
}

interface StatTileProps {
  icon: React.ReactNode
  label: string
  value: number | string
  bg: string
  color: string
}

function StatTile({ icon, label, value, bg, color }: StatTileProps) {
  return (
    <Flex align="center" gap="10px" px="12px" py="10px" borderRadius="12px" bg={bg}>
      <Flex
        w="32px" h="32px" borderRadius="10px"
        bg={WHITE} color={color}
        align="center" justify="center" flexShrink={0}
      >
        {icon}
      </Flex>
      <Box flex={1} minW={0}>
        <Text fontSize="18px" fontWeight={800} color={color} lineHeight={1}>
          {value}
        </Text>
        <Text fontSize="10px" fontWeight={600} color={color} mt="2px"
          style={{ opacity: 0.75, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </Text>
      </Box>
    </Flex>
  )
}

interface LaneToggleProps {
  laneKey: PulseLaneKey
  label: string
  dotColor: string
  active: boolean
  onClick: () => void
}

function LaneToggle({ label, dotColor, active, onClick }: LaneToggleProps) {
  return (
    <Box
      as="button"
      onClick={onClick}
      w="full" textAlign="left"
      px="10px" py="9px" borderRadius="9px"
      bg={active ? GREEN_LT : 'transparent'}
      color={active ? GREEN : GRAY700}
      fontSize="13px" fontWeight={active ? 700 : 500}
      cursor="pointer"
      transition="background 0.12s"
      display="flex" alignItems="center" gap="8px"
      _hover={{ bg: active ? GREEN_LT : GRAY100 }}
    >
      <Flex
        w="16px" h="16px" borderRadius="5px" flexShrink={0}
        align="center" justify="center"
        bg={active ? GREEN : WHITE}
        border={`1.5px solid ${active ? GREEN : GRAY200}`}
        color={WHITE}
      >
        {active ? <FiCheck size={11} strokeWidth={3} /> : null}
      </Flex>
      <Box w="6px" h="6px" borderRadius="full" bg={dotColor} flexShrink={0} />
      <Box flex={1}>{label}</Box>
    </Box>
  )
}

interface QuickLinkProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
}

function QuickLink({ icon, label, onClick }: QuickLinkProps) {
  return (
    <Box
      as="button"
      onClick={onClick}
      w="full" textAlign="left"
      px="10px" py="9px" borderRadius="9px"
      color={GRAY700}
      fontSize="13px" fontWeight={500}
      cursor="pointer"
      transition="background 0.12s"
      display="flex" alignItems="center" gap="10px"
      _hover={{ bg: GRAY100 }}
    >
      <Box color={GRAY500} display="flex" alignItems="center">{icon}</Box>
      <Box flex={1}>{label}</Box>
    </Box>
  )
}

export default function PulseSidebar({ stats, visibleLanes, onToggleLane, onOpenMap }: Props) {
  const navigate = useNavigate()

  return (
    <Box
      w="268px" minW="268px"
      bg={WHITE} borderRight={`1px solid ${GRAY200}`}
      display="flex" flexDirection="column"
      h="100%" overflowY="auto"
    >
      {/* Header */}
      <Box px={4} pt={5} pb={4} borderBottom={`1px solid ${GRAY100}`}>
        <Flex align="center" gap={2}>
          <Flex
            w="32px" h="32px" borderRadius="9px"
            bg={GREEN} color={WHITE}
            align="center" justify="center"
          >
            <FiActivity size={16} />
          </Flex>
          <Text fontSize="20px" fontWeight={800} color={GRAY800}>
            Pulse
          </Text>
        </Flex>
      </Box>

      {/* Stat tiles */}
      <Stack gap="6px" px={3} py={4} borderBottom={`1px solid ${GRAY100}`}>
        <Text fontSize="10px" fontWeight={700} color={GRAY400}
          ml="2px" mb="2px"
          style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          This week
        </Text>
        <StatTile
          icon={<FiStar size={14} />}
          label="New picks"
          value={stats?.new_since_last_visit ?? 0}
          bg={GREEN_LT}
          color={GREEN}
        />
        <StatTile
          icon={<FiBookmark size={14} />}
          label="Saved"
          value={stats?.saved_count ?? 0}
          bg={BLUE_LT}
          color={BLUE}
        />
        <StatTile
          icon={<FiTrendingUp size={14} />}
          label="Handshakes from follows"
          value={stats?.follow_handshakes_week ?? 0}
          bg={AMBER_LT}
          color={AMBER}
        />
      </Stack>

      {/* Lane filters */}
      <Stack gap="2px" px={3} py={4} borderBottom={`1px solid ${GRAY100}`}>
        <Text fontSize="10px" fontWeight={700} color={GRAY400}
          ml="2px" mb="6px"
          style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Lanes
        </Text>
        <LaneToggle
          laneKey="for_you"
          label="For you"
          dotColor={GREEN}
          active={visibleLanes.has('for_you')}
          onClick={() => onToggleLane('for_you')}
        />
        <LaneToggle
          laneKey="events"
          label="Events for you"
          dotColor={AMBER}
          active={visibleLanes.has('events')}
          onClick={() => onToggleLane('events')}
        />
        <LaneToggle
          laneKey="help_others"
          label="Help others"
          dotColor={BLUE}
          active={visibleLanes.has('help_others')}
          onClick={() => onToggleLane('help_others')}
        />
        <LaneToggle
          laneKey="worth_a_look"
          label="Worth a look"
          dotColor={AMBER}
          active={visibleLanes.has('worth_a_look')}
          onClick={() => onToggleLane('worth_a_look')}
        />
        <LaneToggle
          laneKey="nearby"
          label="Nearby"
          dotColor={BLUE}
          active={visibleLanes.has('nearby')}
          onClick={() => onToggleLane('nearby')}
        />
        <LaneToggle
          laneKey="people"
          label="People to follow"
          dotColor={GREEN}
          active={visibleLanes.has('people')}
          onClick={() => onToggleLane('people')}
        />
        <LaneToggle
          laneKey="follows"
          label="From your follows"
          dotColor={YELLOW}
          active={visibleLanes.has('follows')}
          onClick={() => onToggleLane('follows')}
        />
      </Stack>

      {/* Quick links */}
      <Stack gap="2px" px={3} py={4}>
        <Text fontSize="10px" fontWeight={700} color={GRAY400}
          ml="2px" mb="6px"
          style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Shortcuts
        </Text>
        <QuickLink
          icon={<FiBookmark size={14} />}
          label="Saved services"
          onClick={() => navigate('/saved')}
        />
        <QuickLink
          icon={<FiEdit3 size={14} />}
          label="Edit interests"
          onClick={() => navigate('/profile?edit=skills')}
        />
        <QuickLink
          icon={<FiMapPin size={14} />}
          label="Browse on map"
          onClick={() => onOpenMap ? onOpenMap() : navigate('/dashboard')}
        />
        <QuickLink
          icon={<FiUsers size={14} />}
          label="Find people"
          onClick={() => navigate('/users/suggested')}
        />
      </Stack>
    </Box>
  )
}
