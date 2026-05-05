import { Box, Flex, HStack, Stack, Text } from '@chakra-ui/react'
import { FiMapPin } from 'react-icons/fi'
import { Link as RouterLink } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import type { ActivityEvent } from '@/services/activityAPI'
import { actorAvatarStub, actorName } from './shared'

interface ActivityWelcomeCardProps {
  event: ActivityEvent
}

export function ActivityWelcomeCard({ event }: ActivityWelcomeCardProps) {
  const skills = event.actor_skills ?? []
  const location = event.actor_location

  return (
    <Box
      borderWidth="1px"
      borderColor="teal.200"
      borderRadius="14px"
      bg="linear-gradient(135deg, rgba(20,184,166,0.05) 0%, rgba(20,184,166,0.10) 100%)"
      p="16px"
      transition="all 0.18s ease"
      _hover={{ transform: 'translateY(-2px)', boxShadow: '0 12px 24px rgba(20, 184, 166, 0.18)' }}
    >
      <Flex align="center" gap={3} mb="12px">
        <Avatar u={actorAvatarStub(event.actor)} size={56} />
        <Stack gap={0} flex={1} minW={0}>
          <Text fontSize="13px" color="teal.700" fontWeight={700} textTransform="uppercase" letterSpacing="0.5px">
            New neighbor
          </Text>
          <Text fontSize="15px" fontWeight={700} color="gray.900" lineClamp={1}>
            {actorName(event.actor)}
          </Text>
          {location && (
            <Flex align="center" gap="4px" color="gray.600" fontSize="11px">
              <Box as={FiMapPin} />
              {location}
            </Flex>
          )}
        </Stack>
      </Flex>
      {skills.length > 0 && (
        <HStack gap="6px" mb="12px" wrap="wrap">
          {skills.map(s => (
            <Box
              key={s}
              px="9px"
              py="3px"
              borderRadius="999px"
              bg="white"
              borderWidth="1px"
              borderColor="teal.200"
              fontSize="11px"
              fontWeight={600}
              color="teal.700"
            >
              {s}
            </Box>
          ))}
        </HStack>
      )}
      <Flex gap={2}>
        <RouterLink
          to={`/public-profile/${event.actor.id}`}
          style={{ flex: 1, textDecoration: 'none' }}
        >
          <Box
            textAlign="center"
            py="7px"
            borderRadius="9px"
            bg="teal.500"
            color="white"
            fontSize="12px"
            fontWeight={700}
            _hover={{ bg: 'teal.600' }}
          >
            Say hi
          </Box>
        </RouterLink>
        <RouterLink
          to={`/public-profile/${event.actor.id}`}
          style={{ flex: 1, textDecoration: 'none' }}
        >
          <Box
            textAlign="center"
            py="7px"
            borderRadius="9px"
            bg="white"
            borderWidth="1px"
            borderColor="teal.300"
            color="teal.700"
            fontSize="12px"
            fontWeight={700}
            _hover={{ bg: 'teal.50' }}
          >
            Follow
          </Box>
        </RouterLink>
      </Flex>
    </Box>
  )
}
