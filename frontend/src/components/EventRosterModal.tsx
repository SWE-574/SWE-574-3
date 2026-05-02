import { type ReactNode, useState, useEffect, useRef, useCallback } from 'react'
import { Box, Flex, Stack, Text } from '@chakra-ui/react'
import { FiX, FiCheckCircle, FiAlertCircle, FiUsers } from 'react-icons/fi'
import { QRCodeSVG } from 'qrcode.react'
import type { Service } from '@/types'
import type { Handshake } from '@/services/handshakeAPI'
import { serviceAPI } from '@/services/serviceAPI'

import {
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY400, GRAY500, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string; icon?: ReactNode }> = {
  accepted: { label: 'Registered', bg: GRAY100, color: GRAY500 },
  checked_in: { label: 'Checked In', bg: GREEN_LT, color: GREEN },
  attended: { label: 'Attended', bg: GREEN_LT, color: GREEN },
  no_show: { label: 'No-Show', bg: RED_LT, color: RED },
  cancelled: { label: 'Cancelled', bg: GRAY100, color: GRAY500 },
}

interface EventRosterPanelProps {
  service: Service
  handshakes: Handshake[]
  onComplete: () => void
  onMarkAttended: (handshakeId: string) => void
  markingHandshakeId?: string | null
  completing: boolean
  onClose?: () => void
}

interface EventRosterModalProps extends EventRosterPanelProps {
  isOpen: boolean
  service: Service
}

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

export function EventRosterPanel({ service, handshakes, onComplete, onMarkAttended, markingHandshakeId, completing, onClose }: EventRosterPanelProps) {
  const active = handshakes.filter((handshake) => ['accepted', 'checked_in', 'attended', 'no_show'].includes(handshake.status))
  const checkedIn = active.filter((handshake) => handshake.status === 'checked_in').length
  const attended = active.filter((handshake) => handshake.status === 'attended').length
  const registered = active.filter((handshake) => handshake.status === 'accepted').length
  const willBeNoShow = registered + checkedIn

  // ── QR token state ──
  const [qrData, setQrData] = useState<{ qr_payload: string; attendance_code: string; expires_at: string } | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrVisible, setQrVisible] = useState(false)
  const qrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const generateQr = useCallback(async () => {
    setQrLoading(true)
    try {
      const data = await serviceAPI.generateQRToken(service.id)
      setQrData({ qr_payload: data.qr_payload, attendance_code: data.attendance_code, expires_at: data.expires_at })
      setQrVisible(true)
      // Auto-regenerate 10 seconds before expiry
      const msUntilExpiry = new Date(data.expires_at).getTime() - Date.now() - 10_000
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current)
      if (msUntilExpiry > 0) {
        qrTimerRef.current = setTimeout(() => generateQr(), msUntilExpiry)
      }
    } catch {
      // silent — user can retry
    } finally {
      setQrLoading(false)
    }
  }, [service.id])

  useEffect(() => () => { if (qrTimerRef.current) clearTimeout(qrTimerRef.current) }, [])

  // When QR is required, organizer can mark 'accepted' directly (fallback)
  const canMarkAttended = (status: string) =>
    status === 'checked_in' || (service.requires_qr_checkin && status === 'accepted')

  return (
    <Flex direction="column" h="100%" minH={0}>
      <Flex gap={3} px={6} py={4} bg={GRAY50} borderBottom={`1px solid ${GRAY100}`}>
        <Flex align="center" gap="6px" flex={1} justify="center" py={2} borderRadius="10px" bg={WHITE} border={`1px solid ${GRAY200}`}>
          <FiUsers size={13} color={GRAY400} />
          <Text fontSize="13px" fontWeight={700} color={GRAY800}>{active.length}</Text>
          <Text fontSize="11px" color={GRAY500}>total</Text>
        </Flex>
        <Flex align="center" gap="6px" flex={1} justify="center" py={2} borderRadius="10px" bg={GREEN_LT} border={`1px solid ${GREEN}30`}>
          <FiCheckCircle size={13} color={GREEN} />
          <Text fontSize="13px" fontWeight={700} color={GREEN}>{attended}</Text>
          <Text fontSize="11px" color={GREEN}>attended</Text>
        </Flex>
        <Flex align="center" gap="6px" flex={1} justify="center" py={2} borderRadius="10px" bg={AMBER_LT} border={`1px solid ${AMBER}30`}>
          <Text fontSize="11px" color={AMBER} fontWeight={700}>{checkedIn} checked in</Text>
        </Flex>
      </Flex>

      {/* ── QR attendance panel (organizer) ── */}
      {service.requires_qr_checkin && service.status === 'Active' && (
        <Box mx={6} mt={4}>
          {!qrVisible ? (
            <Box
              as="button" w="100%" py="12px" borderRadius="12px"
              bg={GREEN} color={WHITE} fontSize="14px" fontWeight={700}
              display="flex" alignItems="center" justifyContent="center" gap="8px"
              onClick={() => generateQr()}
              style={{ border: 'none', cursor: qrLoading ? 'not-allowed' : 'pointer', opacity: qrLoading ? 0.7 : 1 }}
            >
              {qrLoading ? 'Generating…' : 'Show Attendance QR'}
            </Box>
          ) : qrData && (
            <Flex direction="column" align="center" gap={3} p={5} bg={WHITE}
              borderRadius="16px" border={`1px solid ${GRAY200}`}
              boxShadow="0 2px 12px rgba(0,0,0,0.06)"
            >
              <QRCodeSVG value={qrData.qr_payload} size={200} />
              <Text fontSize="28px" fontWeight={800} letterSpacing="0.15em" color={GRAY800} fontFamily="monospace">
                {qrData.attendance_code}
              </Text>
              <Text fontSize="11px" color={GRAY500}>
                Participants scan QR or enter code above
              </Text>
              <Flex gap={2} w="100%">
                <Box
                  as="button" flex={1} py="8px" borderRadius="8px"
                  bg={GRAY100} color={GRAY700} fontSize="12px" fontWeight={600}
                  onClick={() => { setQrVisible(false); if (qrTimerRef.current) clearTimeout(qrTimerRef.current) }}
                  style={{ border: 'none', cursor: 'pointer' }}
                >
                  Hide
                </Box>
                <Box
                  as="button" flex={1} py="8px" borderRadius="8px"
                  bg={GREEN} color={WHITE} fontSize="12px" fontWeight={600}
                  onClick={() => generateQr()}
                  style={{ border: 'none', cursor: qrLoading ? 'not-allowed' : 'pointer', opacity: qrLoading ? 0.7 : 1 }}
                >
                  {qrLoading ? 'Regenerating…' : 'Regenerate'}
                </Box>
              </Flex>
            </Flex>
          )}
        </Box>
      )}

      {willBeNoShow > 0 && (
        <Box mx={6} mt={4} bg={AMBER_LT} border={`1px solid ${AMBER}40`} borderRadius="12px" p={4}>
          <Flex align="flex-start" gap={3}>
            <FiAlertCircle size={16} color={AMBER} style={{ marginTop: 2, flexShrink: 0 }} />
            <Text fontSize="13px" color="#92400E" lineHeight={1.5}>
              <strong>{willBeNoShow}</strong> participant{willBeNoShow !== 1 ? 's' : ''} not yet marked as
              attended will become <strong>No-Show</strong> when you complete the event.
              {checkedIn > 0 && <> Use the <strong>Mark Attended</strong> button for checked-in participants first.</>}
              {' '}After 3 no-shows, a 14-day participation ban is applied automatically.
            </Text>
          </Flex>
        </Box>
      )}

      <Box flex={1} minH={0} overflowY="auto" px={6} py={4}>
        {active.length === 0 ? (
          <Flex direction="column" align="center" py={8} gap={2}>
            <Text fontSize="2xl">No one yet</Text>
            <Text fontSize="13px" color={GRAY400}>No participants yet.</Text>
          </Flex>
        ) : (
          <Stack gap={2}>
            {active.map((handshake) => {
              const badge = STATUS_BADGE[handshake.status] ?? { label: handshake.status, bg: GRAY100, color: GRAY500 }
              return (
                <Flex key={handshake.id} align="center" gap={3} p={3} bg={GRAY50} borderRadius="10px" border={`1px solid ${GRAY100}`}>
                  <Avatar name={handshake.requester_name} />
                  <Box flex={1} minW={0}>
                    <Text fontSize="13px" fontWeight={600} color={GRAY800}
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {handshake.requester_name}
                    </Text>
                  </Box>
                  <Box px="8px" py="3px" borderRadius="full" fontSize="11px" fontWeight={700}
                    style={{ background: badge.bg, color: badge.color, flexShrink: 0 }}
                  >
                    {badge.label}
                  </Box>
                  {canMarkAttended(handshake.status) && (
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
                        if (markingHandshakeId !== handshake.id) onMarkAttended(handshake.id)
                      }}
                      aria-disabled={markingHandshakeId === handshake.id}
                      style={{ border: 'none', cursor: markingHandshakeId === handshake.id ? 'not-allowed' : 'pointer', opacity: markingHandshakeId === handshake.id ? 0.7 : 1, flexShrink: 0 }}
                    >
                      {markingHandshakeId === handshake.id ? 'Marking…' : 'Mark Attended'}
                    </Box>
                  )}
                </Flex>
              )
            })}
          </Stack>
        )}
      </Box>

      <Flex gap={3} px={6} py={5} borderTop={`1px solid ${GRAY100}`}>
        {onClose && (
          <Box
            as="button" flex={1} py="11px" borderRadius="11px"
            bg={GRAY100} color={GRAY700} fontSize="14px" fontWeight={600}
            onClick={onClose}
            style={{ border: 'none', cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.6 : 1 }}
          >
            Cancel
          </Box>
        )}
        <Box
          as="button" flex={onClose ? 2 : 1} py="11px" borderRadius="11px"
          bg={GREEN} color={WHITE} fontSize="14px" fontWeight={700}
          display="flex" alignItems="center" justifyContent="center" gap="7px"
          onClick={() => !completing && onComplete()}
          style={{ border: 'none', cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.7 : 1, transition: 'opacity 0.15s' }}
        >
          <FiCheckCircle size={15} />
          {completing ? 'Completing…' : 'Mark Event Complete'}
        </Box>
      </Flex>
    </Flex>
  )
}

export default function EventRosterModal({ isOpen, onClose, service, handshakes, onComplete, onMarkAttended, markingHandshakeId, completing }: EventRosterModalProps) {
  if (!isOpen) return null

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
        <Flex align="center" justify="space-between" px={6} py={5} borderBottom={`1px solid ${GRAY100}`}>
          <Box>
            <Text fontSize="17px" fontWeight={800} color={GRAY800}>Event Roster</Text>
            <Text fontSize="12px" color={GRAY500} mt="2px">{service.title}</Text>
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

        <Box flex={1} minH={0}>
          <EventRosterPanel
            service={service}
            handshakes={handshakes}
            onComplete={onComplete}
            onMarkAttended={onMarkAttended}
            markingHandshakeId={markingHandshakeId}
            completing={completing}
            onClose={onClose}
          />
        </Box>
      </Box>
    </Box>
  )
}
