import { Box, Flex, Stack, Text } from '@chakra-ui/react'
import { FiAward } from 'react-icons/fi'
import { Link as RouterLink } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import type { ActivityEvent } from '@/services/activityAPI'
import { actorAvatarStub, actorName } from './shared'

interface ActivityQuoteCardProps {
  event: ActivityEvent
  quote?: string | null
}

// Reused for service_endorsed once that producer is wired (the verb is
// declared on ActivityEvent but the Endorsement model lives on a separate
// branch). The card renders without a quote when none is provided.
export function ActivityQuoteCard({ event, quote }: ActivityQuoteCardProps) {
  const svc = event.service
  if (!svc) return null
  return (
    <Box
      borderWidth="1px"
      borderColor="purple.200"
      borderRadius="14px"
      bg="purple.50"
      p="14px"
      transition="all 0.18s ease"
      _hover={{ transform: 'translateY(-2px)', boxShadow: '0 12px 24px rgba(168, 85, 247, 0.18)' }}
    >
      <Flex align="center" gap={2} mb="8px">
        <Box as={FiAward} color="purple.600" />
        <Text fontSize="12px" fontWeight={700} color="purple.700" textTransform="uppercase" letterSpacing="0.5px">
          Endorsement
        </Text>
      </Flex>
      <Flex align="center" gap={2} mb="10px">
        <Avatar u={actorAvatarStub(event.actor)} size={28} />
        <Text fontSize="13px" fontWeight={600} color="gray.900" lineClamp={2}>
          {actorName(event.actor)} endorsed {actorName(event.target_user) || 'a provider'}
        </Text>
      </Flex>
      {quote && (
        <Text fontSize="13px" color="gray.700" fontStyle="italic" mb="10px" lineClamp={3}>
          "{quote}"
        </Text>
      )}
      <RouterLink
        to={`/service-detail/${svc.id}`}
        style={{ display: 'block', textDecoration: 'none' }}
      >
        <Box
          p="9px"
          borderRadius="9px"
          bg="white"
          borderWidth="1px"
          borderColor="purple.100"
          _hover={{ bg: 'purple.50' }}
        >
          <Flex align="center" gap={2}>
            <Box
              w="32px"
              h="32px"
              borderRadius="6px"
              flexShrink={0}
              style={{
                background: svc.thumbnail_url
                  ? `url(${svc.thumbnail_url}) center/cover no-repeat`
                  : 'linear-gradient(135deg, #16a34a 0%, #166534 100%)',
              }}
            />
            <Stack gap={0} flex={1} minW={0}>
              <Text fontSize="12px" fontWeight={600} color="gray.900" lineClamp={1}>
                {svc.title}
              </Text>
              <Text fontSize="10px" color="gray.500" lineClamp={1}>
                {svc.type}
                {svc.location_area ? ` · ${svc.location_area}` : ''}
              </Text>
            </Stack>
          </Flex>
        </Box>
      </RouterLink>
    </Box>
  )
}
