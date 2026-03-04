import type { ReactNode } from 'react'
import { Box, Flex, Stack, Text } from '@chakra-ui/react'
import { FiX, FiCheckCircle, FiAlertCircle, FiUsers } from 'react-icons/fi'
import type { Service } from '@/types'
import type { Handshake } from '@/services/handshakeAPI'

import {
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY400, GRAY500, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string; icon?: ReactNode }> = {
  accepted:   { label: 'Registered',  bg: GRAY100,   color: GRAY500  },
  checked_in: { label: 'Checked In',  bg: GREEN_LT,  color: GREEN    },
  attended:   { label: 'Attended',    bg: GREEN_LT,  color: GREEN    },
  no_show:    { label: 'No-Show',     bg: RED_LT,    color: RED      },
  cancelled:  { label: 'Cancelled',   bg: GRAY100,   color: GRAY500  },
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean
  onClose: () => void
  service: Service
  handshakes: Handshake[]
  onComplete: () => void
  onMarkAttended: (handshakeId: string) => void
  markingHandshakeId?: string | null
  completing: boolean
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((n) => n[0] ?? '').join('').toUpperCase().slice(0, 2)
  return (
    <Box w="34px" h="34px" borderRadius="full" bg={GREEN} color={WHITE}
      display="flex" alignItems="center" justifyContent="center"
      fontSize="12px" fontWeight={700} flexShrink={0}
    >
      {initials}
    </Box>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventRosterModal({
  isOpen,
  onClose,
  service,
  handshakes,
  onComplete,
  onMarkAttended,
  markingHandshakeId,
  completing,
}: Props) {
  if (!isOpen) return null

  const active = handshakes.filter(h => ['accepted', 'checked_in', 'attended', 'no_show'].includes(h.status))
  const checkedIn = active.filter(h => h.status === 'checked_in').length
  const attended = active.filter(h => h.status === 'attended').length
  const registered = active.filter(h => h.status === 'accepted').length
  const willBeNoShow = registered + checkedIn  // accepted + checked_in → no_show on complete

  return (
    <Box
      position="fixed" inset={0} zIndex={1000}
      bg="rgba(0,0,0,0.55)"
      display="flex" alignItems="center" justifyContent="center"
      p={4}
      onClick={onClose}
    >
      <Box
        bg={WHITE} borderRadius="20px" w="100%" maxW="480px"
        boxShadow="0 20px 60px rgba(0,0,0,0.2)"
        onClick={(e) => e.stopPropagation()}
        maxH="85vh" display="flex" flexDirection="column"
      >
        {/* Header */}
        <Flex align="center" justify="space-between" px={6} py={5}
          borderBottom={`1px solid ${GRAY100}`}
        >
          <Box>
            <Text fontSize="17px" fontWeight={800} color={GRAY800}>Event Roster</Text>
            <Text fontSize="12px" color={GRAY500} mt="2px">
              {service.title}
            </Text>
          </Box>
          <Box
            as="button" onClick={onClose}
            w="30px" h="30px" borderRadius="8px" bg={GRAY50}
            display="flex" alignItems="center" justifyContent="center"
            style={{ border: `1px solid ${GRAY200}`, cursor: 'pointer' }}
          >
            <FiX size={14} color={GRAY500} />
          </Box>
        </Flex>

        {/* Stats bar */}
        <Flex gap={3} px={6} py={4} bg={GRAY50} borderBottom={`1px solid ${GRAY100}`}>
          <Flex align="center" gap="6px" flex={1} justify="center"
            py={2} borderRadius="10px" bg={WHITE} border={`1px solid ${GRAY200}`}
          >
            <FiUsers size={13} color={GRAY400} />
            <Text fontSize="13px" fontWeight={700} color={GRAY800}>{active.length}</Text>
            <Text fontSize="11px" color={GRAY500}>total</Text>
          </Flex>
          <Flex align="center" gap="6px" flex={1} justify="center"
            py={2} borderRadius="10px" bg={GREEN_LT} border={`1px solid ${GREEN}30`}
          >
            <FiCheckCircle size={13} color={GREEN} />
            <Text fontSize="13px" fontWeight={700} color={GREEN}>{attended}</Text>
            <Text fontSize="11px" color={GREEN}>attended</Text>
          </Flex>
          <Flex align="center" gap="6px" flex={1} justify="center"
            py={2} borderRadius="10px" bg={AMBER_LT} border={`1px solid ${AMBER}30`}
          >
            <Text fontSize="11px" color={AMBER} fontWeight={700}>{checkedIn} checked in</Text>
          </Flex>
        </Flex>

        {/* Warning */}
        {willBeNoShow > 0 && (
          <Box mx={6} mt={4} bg={AMBER_LT} border={`1px solid ${AMBER}40`} borderRadius="12px" p={4}>
            <Flex align="flex-start" gap={3}>
              <FiAlertCircle size={16} color={AMBER} style={{ marginTop: 2, flexShrink: 0 }} />
              <Text fontSize="13px" color="#92400E" lineHeight={1.5}>
                <strong>{willBeNoShow}</strong> registered participant{willBeNoShow !== 1 ? 's' : ''} without
                check-in will be marked as <strong>No-Show</strong>. After 3 no-shows, a 14-day participation
                ban is applied automatically.
              </Text>
            </Flex>
          </Box>
        )}

        {/* Participant list */}
        <Box flex={1} overflowY="auto" px={6} py={4}>
          {active.length === 0 ? (
            <Flex direction="column" align="center" py={8} gap={2}>
              <Text fontSize="2xl">🤷</Text>
              <Text fontSize="13px" color={GRAY400}>No participants yet.</Text>
            </Flex>
          ) : (
            <Stack gap={2}>
              {active.map((h) => {
                const cfg = STATUS_BADGE[h.status] ?? { label: h.status, bg: GRAY100, color: GRAY500 }
                return (
                  <Flex key={h.id} align="center" gap={3} p={3}
                    bg={GRAY50} borderRadius="10px" border={`1px solid ${GRAY100}`}
                  >
                    <Avatar name={h.requester_name} />
                    <Box flex={1} minW={0}>
                      <Text fontSize="13px" fontWeight={600} color={GRAY800}
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {h.requester_name}
                      </Text>
                    </Box>
                    <Box px="8px" py="3px" borderRadius="full" fontSize="11px" fontWeight={700}
                      style={{ background: cfg.bg, color: cfg.color, flexShrink: 0 }}
                    >
                      {cfg.label}
                    </Box>
                    {h.status === 'checked_in' && (
                      <Box
                        as="button"
                        px="10px"
                        py="6px"
                        borderRadius="8px"
                        bg={GREEN}
                        color={WHITE}
                        fontSize="11px"
                        fontWeight={700}
                        onClick={() => {
                          if (markingHandshakeId !== h.id) onMarkAttended(h.id)
                        }}
                        aria-disabled={markingHandshakeId === h.id}
                        style={{
                          border: 'none',
                          cursor: markingHandshakeId === h.id ? 'not-allowed' : 'pointer',
                          opacity: markingHandshakeId === h.id ? 0.7 : 1,
                          flexShrink: 0,
                        }}
                      >
                        {markingHandshakeId === h.id ? 'Marking…' : 'Mark Attended'}
                      </Box>
                    )}
                  </Flex>
                )
              })}
            </Stack>
          )}
        </Box>

        {/* Actions */}
        <Flex gap={3} px={6} py={5} borderTop={`1px solid ${GRAY100}`}>
          <Box
            as="button" flex={1} py="11px" borderRadius="11px"
            bg={GRAY100} color={GRAY700} fontSize="14px" fontWeight={600}
            onClick={onClose}
            style={{ border: 'none', cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.6 : 1 }}
          >
            Cancel
          </Box>
          <Box
            as="button" flex={2} py="11px" borderRadius="11px"
            bg={GREEN} color={WHITE} fontSize="14px" fontWeight={700}
            display="flex" alignItems="center" justifyContent="center" gap="7px"
            onClick={() => !completing && onComplete()}
            style={{
              border: 'none',
              cursor: completing ? 'not-allowed' : 'pointer',
              opacity: completing ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <FiCheckCircle size={15} />
            {completing ? 'Completing…' : 'Mark Event Complete'}
          </Box>
        </Flex>
      </Box>
    </Box>
  )
}
