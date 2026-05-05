import { Box, Flex, Stack, Text } from '@chakra-ui/react'
import { FiCheckCircle, FiUsers } from 'react-icons/fi'
import { Link as RouterLink } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import type { ActivityEvent } from '@/services/activityAPI'
import { actorAvatarStub, actorName } from './shared'

interface ActivityMatchCardProps {
  event: ActivityEvent
  variant?: 'accepted' | 'completed'
}

export function ActivityMatchCard({ event, variant = 'accepted' }: ActivityMatchCardProps) {
  const a = event.actor
  const b = event.target_user
  const svc = event.service
  const isComplete = variant === 'completed'
  const accent = isComplete ? 'green' : 'gray'
  const verbText = isComplete
    ? `${actorName(a)} and ${actorName(b)} finished helping each other`
    : `${actorName(a)} and ${actorName(b)} are working together`
  const hours = event.handshake_duration_hours

  return (
    <Box
      borderWidth="1px"
      borderColor={isComplete ? 'green.300' : 'gray.200'}
      borderRadius="14px"
      bg="white"
      p="14px"
      transition="all 0.18s ease"
      _hover={{
        transform: 'translateY(-2px)',
        boxShadow: isComplete
          ? '0 12px 24px rgba(34, 197, 94, 0.18)'
          : '0 12px 24px rgba(0, 0, 0, 0.08)',
      }}
    >
      <Flex align="center" gap={3} mb="10px">
        <Box position="relative" w="60px" h="36px" flexShrink={0}>
          <Box position="absolute" left={0} top={0}>
            <Avatar u={actorAvatarStub(a)} size={36} />
          </Box>
          <Box position="absolute" left="22px" top={0} borderWidth="2px" borderColor="white" borderRadius="full">
            {b ? <Avatar u={actorAvatarStub(b)} size={36} /> : null}
          </Box>
        </Box>
        <Stack gap={0} flex={1} minW={0}>
          <Flex align="center" gap="6px">
            {isComplete ? (
              <Box as={FiCheckCircle} color={`${accent}.500`} />
            ) : (
              <Box as={FiUsers} color="gray.500" />
            )}
            <Text fontSize="13px" fontWeight={600} color="gray.900" lineClamp={2}>
              {verbText}
            </Text>
          </Flex>
          {isComplete && hours != null && (
            <Text fontSize="11px" color="green.700" fontWeight={700}>
              +{hours.toFixed(hours % 1 === 0 ? 0 : 1)} hrs banked
            </Text>
          )}
        </Stack>
      </Flex>
      {svc && (
        <RouterLink
          to={`/service-detail/${svc.id}`}
          style={{ display: 'block', textDecoration: 'none' }}
        >
          <Box
            p="9px"
            borderRadius="9px"
            bg="gray.50"
            _hover={{ bg: 'gray.100' }}
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
      )}
    </Box>
  )
}
