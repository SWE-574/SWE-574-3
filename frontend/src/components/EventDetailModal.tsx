import { Box, Flex, Grid, Stack, Text } from '@chakra-ui/react'
import {
  FiCalendar, FiCheckCircle, FiClock, FiInfo, FiMapPin, FiMessageSquare,
  FiMonitor, FiUsers, FiX,
} from 'react-icons/fi'
import type { Service } from '@/types'
import type { Handshake } from '@/services/handshakeAPI'
import { EventChatPanel } from '@/components/EventChatModal'
import { EventRosterPanel } from '@/components/EventRosterModal'
import { formatEventDateTime, isFutureEvent, isNearlyFull, spotsLeft, timeUntilEvent } from '@/utils/eventUtils'
import {
  AMBER, AMBER_LT,
  GREEN, GREEN_LT,
  RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY400, GRAY500, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'

export type EventDetailModalTab = 'details' | 'roster' | 'chat'

interface Props {
  isOpen: boolean
  activeTab: EventDetailModalTab
  onTabChange: (tab: EventDetailModalTab) => void
  onClose: () => void
  service: Service
  handshakes: Handshake[]
  onComplete: () => void
  onMarkAttended: (handshakeId: string) => void
  onReportUser?: (userId: string, userName: string) => void
  markingHandshakeId?: string | null
  reportingIssue?: boolean
  completing: boolean
  isOwner: boolean
}

function DetailTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Flex align="center" gap={3} p={4} borderRadius="14px" bg={GRAY50} border={`1px solid ${GRAY100}`}>
      <Flex w="38px" h="38px" borderRadius="11px" bg={AMBER_LT} color={AMBER} align="center" justify="center" flexShrink={0}>
        {icon}
      </Flex>
      <Box minW={0}>
        <Text fontSize="10px" color={GRAY400} fontWeight={700} style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </Text>
        <Text fontSize="13px" color={GRAY800} fontWeight={700} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </Text>
      </Box>
    </Flex>
  )
}

function TabButton({ label, icon, isActive, onClick }: { label: string; icon: React.ReactNode; isActive: boolean; onClick: () => void }) {
  return (
    <Box
      as="button"
      onClick={onClick}
      aria-selected={isActive}
      role="tab"
      px={4}
      py="10px"
      borderRadius="12px"
      bg={isActive ? AMBER : WHITE}
      color={isActive ? WHITE : GRAY700}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      gap="8px"
      fontSize="13px"
      fontWeight={700}
      minW="120px"
      style={{ border: isActive ? 'none' : `1px solid ${GRAY200}`, cursor: 'pointer' }}
    >
      {icon}
      {label}
    </Box>
  )
}

export default function EventDetailModal({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  service,
  handshakes,
  onComplete,
  onMarkAttended,
  onReportUser,
  markingHandshakeId,
  reportingIssue = false,
  completing,
  isOwner,
}: Props) {
  if (!isOpen) return null

  const countdownLabel = isFutureEvent(service.scheduled_time) ? timeUntilEvent(service.scheduled_time) : 'Event started'
  const locationLabel = service.location_type === 'Online'
    ? 'Online'
    : service.location_area ?? 'In-Person'
  const spotLabel = service.max_participants > 0
    ? `${service.participant_count ?? 0}/${service.max_participants} joined · ${spotsLeft(service.max_participants, service.participant_count ?? 0)} spots left`
    : `${service.participant_count ?? 0} joined`

  return (
    <Box
      position="fixed" inset={0} zIndex={1000}
      bg="rgba(0,0,0,0.55)"
      display="flex" alignItems="center" justifyContent="center"
      p={{ base: 3, md: 5 }}
      onClick={onClose}
    >
      <Box
        bg={WHITE}
        borderRadius="24px"
        w="100%"
        maxW="960px"
        h="min(88vh, 820px)"
        boxShadow="0 24px 70px rgba(0,0,0,0.22)"
        onClick={(e) => e.stopPropagation()}
        display="flex"
        flexDirection="column"
        overflow="hidden"
      >
        <Flex align="center" justify="space-between" px={{ base: 5, md: 7 }} py={5} borderBottom={`1px solid ${GRAY100}`} bg={AMBER_LT}>
          <Flex align="center" gap={3} minW={0}>
            <Flex w="40px" h="40px" borderRadius="12px" bg={AMBER} color={WHITE} align="center" justify="center" flexShrink={0}>
              <FiCalendar size={18} />
            </Flex>
            <Box minW={0}>
              <Flex align="center" gap="8px">
                <Text fontSize="17px" fontWeight={800} color={GRAY800}>Event Details</Text>
                {isNearlyFull(service.max_participants, service.participant_count ?? 0) && (
                  <Box px="7px" py="2px" borderRadius="full" fontSize="10px" fontWeight={700} bg={RED_LT} color={RED} flexShrink={0}>
                    Nearly Full
                  </Box>
                )}
              </Flex>
              <Text fontSize="12px" color={GRAY500} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {service.title}
              </Text>
            </Box>
          </Flex>
          <Box
            as="button"
            onClick={onClose}
            w="34px"
            h="34px"
            borderRadius="10px"
            bg={WHITE}
            display="flex"
            alignItems="center"
            justifyContent="center"
            aria-label="Close event details"
            style={{ border: `1px solid ${GRAY200}`, cursor: 'pointer' }}
          >
            <FiX size={15} color={GRAY500} />
          </Box>
        </Flex>

        <Flex px={{ base: 5, md: 7 }} py={4} gap={3} wrap="wrap" role="tablist" borderBottom={`1px solid ${GRAY100}`}>
          <TabButton label="Details" icon={<FiInfo size={14} />} isActive={activeTab === 'details'} onClick={() => onTabChange('details')} />
          {isOwner && (
            <TabButton label="Roster" icon={<FiUsers size={14} />} isActive={activeTab === 'roster'} onClick={() => onTabChange('roster')} />
          )}
          <TabButton label="Chat" icon={<FiMessageSquare size={14} />} isActive={activeTab === 'chat'} onClick={() => onTabChange('chat')} />
        </Flex>

        <Box flex={1} minH={0}>
          {activeTab === 'details' && (
            <Flex direction="column" h="100%" minH={0}>
              <Box flex={1} minH={0} overflowY="auto" px={{ base: 5, md: 7 }} py={6}>
                <Stack gap={6}>
                  <Box bg={GRAY50} borderRadius="18px" border={`1px solid ${GRAY100}`} p={{ base: 5, md: 6 }}>
                    <Text fontSize="18px" fontWeight={800} color={GRAY800}>Stay in the event context</Text>
                    <Text mt={2} fontSize="13px" lineHeight={1.7} color={GRAY700}>
                      Review the event, jump into the live chat, and manage attendance without leaving this view.
                    </Text>
                  </Box>

                  <Grid templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={4}>
                    <DetailTile icon={<FiCalendar size={16} />} label="Date & Time" value={formatEventDateTime(service.scheduled_time)} />
                    <DetailTile icon={<FiClock size={16} />} label="Countdown" value={countdownLabel} />
                    <DetailTile icon={service.location_type === 'Online' ? <FiMonitor size={16} /> : <FiMapPin size={16} />} label="Location" value={locationLabel} />
                    <DetailTile icon={<FiUsers size={16} />} label="Participants" value={spotLabel} />
                  </Grid>

                  <Box>
                    <Text fontSize="12px" fontWeight={800} color={GRAY500} style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Description
                    </Text>
                    <Box mt={3} p={5} borderRadius="16px" bg={WHITE} border={`1px solid ${GRAY100}`}>
                      <Text fontSize="14px" lineHeight={1.7} color={GRAY700} whiteSpace="pre-wrap">
                        {service.description}
                      </Text>
                    </Box>
                  </Box>
                </Stack>
              </Box>

              <Flex gap={3} px={{ base: 5, md: 7 }} py={5} borderTop={`1px solid ${GRAY100}`} wrap="wrap">
                <Box
                  as="button"
                  onClick={() => onTabChange('chat')}
                  px={5}
                  py="12px"
                  borderRadius="12px"
                  bg={AMBER}
                  color={WHITE}
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  gap="8px"
                  fontSize="14px"
                  fontWeight={700}
                  style={{ border: 'none', cursor: 'pointer' }}
                >
                  <FiMessageSquare size={15} />
                  Open Event Chat
                </Box>
                {isOwner && (
                  <Box
                    as="button"
                    onClick={() => onTabChange('roster')}
                    px={5}
                    py="12px"
                    borderRadius="12px"
                    bg={GREEN_LT}
                    color={GREEN}
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    gap="8px"
                    fontSize="14px"
                    fontWeight={700}
                    style={{ border: `1px solid ${GREEN}30`, cursor: 'pointer' }}
                  >
                    <FiCheckCircle size={15} />
                    Review Roster
                  </Box>
                )}
              </Flex>
            </Flex>
          )}

          {activeTab === 'roster' && isOwner && (
            <EventRosterPanel
              handshakes={handshakes}
              onComplete={onComplete}
              onMarkAttended={onMarkAttended}
              markingHandshakeId={markingHandshakeId}
              completing={completing}
            />
          )}

          {activeTab === 'chat' && (
            <EventChatPanel key={service.id} service={service} onReportUser={onReportUser} reportingIssue={reportingIssue} />
          )}
        </Box>
      </Box>
    </Box>
  )
}