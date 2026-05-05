import { Box, Flex, Text } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import type { ActivityEvent } from '@/services/activityAPI'
import { actorAvatarStub, actorName } from './shared'

interface ActivityFollowStripProps {
  event: ActivityEvent
}

export function ActivityFollowStrip({ event }: ActivityFollowStripProps) {
  const target = event.target_user
  return (
    <Flex
      align="center"
      gap={2}
      px="12px"
      py="8px"
      borderRadius="10px"
      borderWidth="1px"
      borderColor="gray.150"
      bg="white"
      _hover={{ bg: 'gray.50' }}
    >
      <Avatar u={actorAvatarStub(event.actor)} size={24} />
      {target && <Avatar u={actorAvatarStub(target)} size={24} />}
      <Text fontSize="12px" color="gray.700" lineClamp={1} flex={1}>
        <Box as="strong" color="gray.900" fontWeight={600}>
          {actorName(event.actor)}
        </Box>
        {' started following '}
        {target ? (
          <RouterLink
            to={`/public-profile/${target.id}`}
            style={{ fontWeight: 600, color: '#111827', textDecoration: 'none' }}
          >
            {actorName(target)}
          </RouterLink>
        ) : 'someone'}
      </Text>
    </Flex>
  )
}
