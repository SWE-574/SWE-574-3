import { useNavigate } from 'react-router-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiArrowLeft, FiAlertCircle } from 'react-icons/fi'
import ServiceForm from '@/components/ServiceForm'
import { useAuthStore } from '@/store/useAuthStore'
import { isOrganizerBanned, formatBanExpiry } from '@/utils/eventUtils'

import { AMBER, AMBER_LT, RED, RED_LT, GRAY50, GRAY200, GRAY400, GRAY500, WHITE } from '@/theme/tokens'

export default function PostEventForm() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const banned = isOrganizerBanned(user?.is_organizer_banned_until)
  const banExpiry = formatBanExpiry(user?.is_organizer_banned_until)

  return (
    <Box bg={GRAY50} minH="calc(100vh - 64px)" py={{ base: 3, md: 5 }} px={{ base: 3, md: 5 }}>
      <Box maxW="720px" mx="auto">

        {/* Back */}
        <Box
          as="button" onClick={() => navigate(-1)}
          display="flex" alignItems="center" gap="6px"
          fontSize="13px" fontWeight={600} color={GRAY500} mb={4}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.color = '#1F2937' }}
          onMouseLeave={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.color = GRAY500 }}
        >
          <FiArrowLeft size={15} /> Back
        </Box>

        {/* Header card */}
        <Box bg={WHITE} borderRadius="20px" border={`1px solid ${GRAY200}`} overflow="hidden"
          boxShadow="0 4px 20px rgba(0,0,0,0.06)" mb={4}
        >
          <Box h="5px" style={{ background: `linear-gradient(90deg, ${AMBER} 0%, #B45309 100%)` }} />
          <Box px={6} py={5}>
            <Flex align="center" gap={3}>
              <Box w="44px" h="44px" borderRadius="12px" flexShrink={0}
                display="flex" alignItems="center" justifyContent="center"
                style={{ background: `linear-gradient(135deg, ${AMBER} 0%, #B45309 100%)` }}
                fontSize="22px"
              >
                📅
              </Box>
              <Box>
                <Text fontSize="20px" fontWeight={800} color="#1F2937" lineHeight={1.2}>Create an Event</Text>
                <Text fontSize="13px" color={GRAY400} mt="3px">
                  Organize a community event — no TimeBank credits involved
                </Text>
              </Box>
            </Flex>
          </Box>
        </Box>

        {/* Organizer ban alert */}
        {banned && (
          <Box bg={RED_LT} border="1px solid #FCA5A5" borderRadius="14px" p={4} mb={4}
            display="flex" alignItems="flex-start" gap={3}
          >
            <FiAlertCircle size={18} color={RED} style={{ flexShrink: 0, marginTop: 2 }} />
            <Box>
              <Text fontSize="14px" fontWeight={700} color={RED}>Event Creation Suspended</Text>
              <Text fontSize="13px" color="#991B1B" mt="3px">
                You cancelled an event with participants during the lockdown window. You cannot create
                new events until <strong>{banExpiry}</strong>.
              </Text>
            </Box>
          </Box>
        )}

        {/* Form card */}
        <Box bg={WHITE} borderRadius="20px" border={`1px solid ${GRAY200}`} p={6}
          boxShadow="0 4px 20px rgba(0,0,0,0.06)"
          style={{ opacity: banned ? 0.5 : 1, pointerEvents: banned ? 'none' : 'auto' }}
        >
          {/* Info banner */}
          <Box bg={AMBER_LT} border={`1px solid ${AMBER}30`} borderRadius="12px" p={4} mb={5}>
            <Text fontSize="13px" color="#92400E" fontWeight={600}>
              📌 How Events work
            </Text>
            <Text fontSize="12px" color="#92400E" mt="4px" lineHeight={1.6}>
              Participants join directly (no approval needed). Check-in opens 24 hours before the event.
              After completing, unverified participants are marked as no-shows. Three no-shows result in a
              14-day participation ban.
            </Text>
          </Box>

          <ServiceForm type="Event" />
        </Box>

      </Box>
    </Box>
  )
}
